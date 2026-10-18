// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SourceStore } from '../../src/main/storage/store';
import { importSelectedFiles } from '../../src/main/storage/import';
import { importLimits } from '../../src/shared/sources';

let directory: string;
let store: SourceStore;
let inspection: Database.Database;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'typenudge-storage-'));
  const database = path.join(directory, 'sources.sqlite3');
  store = new SourceStore(database);
  inspection = new Database(database);
  inspection.pragma('foreign_keys = ON');
});

afterEach(async () => {
  inspection.close();
  store.close();
  await rm(directory, { recursive: true, force: true });
});

async function file(name: string, body: string | Buffer): Promise<string> {
  const filename = path.join(directory, name);
  await writeFile(filename, body);
  return filename;
}

function grams(id: string, n: number): unknown[] {
  return inspection.prepare('SELECT context_key, next_token, display_token, frequency FROM ngrams WHERE source_id = ? AND n = ? ORDER BY context_key, next_token').all(id, n);
}

function revision(): string {
  return (inspection.prepare("SELECT value FROM settings WHERE key = 'indexRevision'").get() as { value: string }).value;
}

describe('real SQLite source storage', () => {
  it('migrates a persistent DB with consent off, all N sizes, constraints and lookup indexes', () => {
    expect(inspection.pragma('user_version', { simple: true })).toBe(1);
    expect(inspection.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(inspection.prepare("SELECT value FROM settings WHERE key = 'personalLearning'").get()).toEqual({ value: 'false' });
    expect(inspection.prepare("SELECT value FROM settings WHERE key = 'enabledN'").get()).toEqual({ value: '[1,2,3]' });
    expect(inspection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all())
      .toEqual(['documents', 'ngrams', 'settings', 'sources'].map((name) => ({ name })));
    expect(() => inspection.prepare('INSERT INTO ngrams VALUES (?, 4, ?, ?, ?, 1)').run('unknown', '', 'a', 'a')).toThrow();
    expect(inspection.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('counts Unicode NFC words, apostrophes and each N without crossing punctuation or newlines', async () => {
    const selected = await file('Magyar.MD', "A\u0301rvíz, árvíz tükör. Știință e bună! Don't don’t\n日本語 文章");
    expect(await importSelectedFiles([selected], store)).toMatchObject({ imported: 1, errors: [] });
    const [source] = store.list();
    expect(source).toMatchObject({ name: 'Magyar.MD', revision: 1, enabled: true, tokenCount: 10 });
    expect(grams(source!.id, 1)).toContainEqual({ context_key: '', next_token: 'árvíz', display_token: 'Árvíz', frequency: 2 });
    expect(grams(source!.id, 1)).toContainEqual({ context_key: '', next_token: "don't", display_token: "Don't", frequency: 2 });
    expect(grams(source!.id, 3)).toEqual([
      { context_key: '["árvíz","árvíz"]', next_token: 'tükör', display_token: 'tükör', frequency: 1 },
      { context_key: '["știință","e"]', next_token: 'bună', display_token: 'bună', frequency: 1 },
    ]);
    expect(grams(source!.id, 2)).not.toContainEqual(expect.objectContaining({ context_key: '["tükör"]', next_token: 'știință' }));
    expect(grams(source!.id, 2)).not.toContainEqual(expect.objectContaining({ context_key: '["don\'t"]', next_token: '日本語' }));
  });

  it('keeps IDs, hashes, revisions and counts stable on an identical reimport', async () => {
    const selected = await file('same.txt', 'one two one two');
    await importSelectedFiles([selected], store);
    const original = store.list()[0]!;
    const counts = grams(original.id, 2);
    expect(await importSelectedFiles([selected, selected], store)).toMatchObject({ imported: 0, unchanged: 2 });
    expect(store.list()).toEqual([original]);
    expect(grams(original.id, 2)).toEqual(counts);
    expect(revision()).toBe('1');
    expect(original.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('replaces an edited file, preserves enabled state and leaves another source untouched', async () => {
    const first = await file('first.txt', 'old old word');
    const second = await file('second.md', 'other text');
    await importSelectedFiles([first, second], store);
    const initial = store.list();
    const firstSource = initial.find((source) => source.name === 'first.txt')!;
    const other = initial.find((source) => source.name === 'second.md')!;
    const othersCounts = grams(other.id, 1);
    inspection.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(firstSource.id);
    await writeFile(first, 'new text');
    expect(await importSelectedFiles([first], store)).toMatchObject({ imported: 1, unchanged: 0 });
    expect(store.list().find((source) => source.id === firstSource.id)).toMatchObject({ revision: 2, enabled: false, tokenCount: 2 });
    expect(grams(firstSource.id, 1)).toEqual([
      { context_key: '', next_token: 'new', display_token: 'new', frequency: 1 },
      { context_key: '', next_token: 'text', display_token: 'text', frequency: 1 },
    ]);
    expect(store.list().find((source) => source.id === other.id)).toEqual(other);
    expect(grams(other.id, 1)).toEqual(othersCounts);
    expect(inspection.prepare('SELECT body_text FROM documents WHERE source_id = ?').get(firstSource.id)).toEqual({ body_text: 'new text' });
    expect(revision()).toBe('3');
  });

  it('rolls back body, hash, revision and previous counts when SQLite rejects a replacement', async () => {
    const selected = await file('atomic.txt', 'old count');
    await importSelectedFiles([selected], store);
    const original = store.list()[0]!;
    const oldCounts = grams(original.id, 1);
    inspection.exec("CREATE TRIGGER reject_new BEFORE INSERT ON ngrams WHEN new.next_token = 'fail' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    await writeFile(selected, 'new fail');
    const report = await importSelectedFiles([selected], store);
    expect(report.imported).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(store.list()).toEqual([original]);
    expect(grams(original.id, 1)).toEqual(oldCounts);
    expect(inspection.prepare('SELECT body_text FROM documents WHERE source_id = ?').get(original.id)).toEqual({ body_text: 'old count' });
    expect(revision()).toBe('1');
  });

  it('reindexes from the stored body after the original file is removed, without inflating counts', async () => {
    const selected = await file('retained.txt', 'one two one two');
    await importSelectedFiles([selected], store);
    const source = store.list()[0]!;
    const counts = grams(source.id, 2);
    await rm(selected);
    expect(store.reindex(source.id).revision).toBe(2);
    expect(store.reindex(source.id).revision).toBe(3);
    expect(grams(source.id, 2)).toEqual(counts);
    expect(store.list()[0]!.contentHash).toBe(source.contentHash);
    expect(revision()).toBe('3');
  });

  it('cascades deletion for only the selected source and persists the other source across reopen', async () => {
    await importSelectedFiles([await file('a.txt', 'one two'), await file('b.txt', 'two three')], store);
    const first = store.list().find((source) => source.name === 'a.txt')!;
    const second = store.list().find((source) => source.name === 'b.txt')!;
    const retained = grams(second.id, 2);
    store.delete(first.id);
    expect(inspection.prepare('SELECT * FROM documents WHERE source_id = ?').all(first.id)).toEqual([]);
    expect(grams(first.id, 1)).toEqual([]);
    expect(grams(second.id, 2)).toEqual(retained);
    store.close();
    store = new SourceStore(path.join(directory, 'sources.sqlite3'));
    expect(store.list()).toEqual([second]);
    expect(() => store.reindex(first.id)).toThrow('no longer exists');
    expect(() => store.delete(first.id)).toThrow('no longer exists');
  });

  it('treats identical names/content at different selected paths as independent sources', async () => {
    await mkdir(path.join(directory, 'other'));
    await importSelectedFiles([await file('same.txt', 'shared text'), await file('other/same.txt', 'shared text')], store);
    const sources = store.list();
    expect(sources).toHaveLength(2);
    expect(sources[0]!.id).not.toBe(sources[1]!.id);
    expect(grams(sources[0]!.id, 2)).toEqual(grams(sources[1]!.id, 2));
    expect(inspection.prepare('SELECT COUNT(*) AS count FROM ngrams WHERE n = 3').get()).toEqual({ count: 0 });
  });

  it('supports indexed Unicode prefix ranges and per-context lookups', async () => {
    await importSelectedFiles([await file('prefix.txt', 'árvíz árnyék alma')], store);
    const id = store.list()[0]!.id;
    expect(inspection.prepare('SELECT next_token FROM ngrams WHERE source_id = ? AND n = 1 AND context_key = ? AND next_token >= ? AND next_token < ? ORDER BY next_token')
      .all(id, '', 'ár', 'ás')).toEqual([{ next_token: 'árnyék' }, { next_token: 'árvíz' }]);
    const plan = inspection.prepare('EXPLAIN QUERY PLAN SELECT next_token FROM ngrams WHERE source_id = ? AND n = 2 AND context_key = ? AND next_token >= ? AND next_token < ?')
      .all(id, '["árvíz"]', 'á', 'â') as { detail: string }[];
    expect(plan.some((step) => step.detail.includes('PRIMARY KEY'))).toBe(true);
  });

  it('does not modify or downgrade a newer schema', () => {
    inspection.pragma('user_version = 2');
    expect(() => new SourceStore(path.join(directory, 'sources.sqlite3'))).toThrow('newer version');
    expect(inspection.pragma('user_version', { simple: true })).toBe(2);
  });

  it('enforces source count and cumulative stored-text limits without damaging existing sources', () => {
    for (let i = 0; i < importLimits.sources; i++) store.replace(`fixture-${i}`, `source-${i}.txt`, 'small text');
    expect(() => store.replace('overflow', 'overflow.txt', 'extra')).toThrow('source limit');
    expect(store.replace('fixture-0', 'source-0.txt', 'replacement')).toBe('imported');
    expect(store.list()).toHaveLength(importLimits.sources);
    inspection.prepare("UPDATE documents SET byte_length = ? WHERE source_id = (SELECT id FROM sources WHERE origin_key = 'fixture-1')").run(importLimits.storedBytes);
    expect(() => store.replace('fixture-0', 'source-0.txt', 'another replacement')).toThrow('32 MiB');
    expect(store.list()).toHaveLength(importLimits.sources);
  });
});

describe('bounded explicit file import', () => {
  it.each([
    ['invalid.txt', Buffer.from([0xc3, 0x28]), 'UTF-8'],
    ['utf16.md', Buffer.from([0xff, 0xfe, 0x61, 0x00]), 'UTF-8'],
    ['binary.txt', Buffer.from('hello\0world'), 'control'],
    ['file.html', Buffer.from('<script>alert(1)</script>'), '.txt or .md'],
  ])('rejects malformed or unsupported %s and allows a later valid import', async (name, bytes, reason) => {
    const report = await importSelectedFiles([await file(name, bytes)], store);
    expect(report.errors[0]?.message).toContain(reason);
    expect(store.list()).toEqual([]);
    expect(await importSelectedFiles([await file('valid.txt', 'works now')], store)).toMatchObject({ imported: 1 });
  });

  it('accepts BOM, empty text and literal markup strictly as stored plain text', async () => {
    const body = '<script>alert("fixture")</script>\nÁrvíz';
    expect(await importSelectedFiles([await file('bom.md', '\ufeff' + body), await file('empty.txt', '')], store)).toMatchObject({ imported: 2, errors: [] });
    expect(inspection.prepare('SELECT body_text FROM documents WHERE byte_length > 0').get()).toEqual({ body_text: body });
    expect(store.list().find((source) => source.name === 'empty.txt')?.tokenCount).toBe(0);
  });

  it('returns per-file recoverable errors while retaining valid selected files', async () => {
    const missing = path.join(directory, 'missing.txt');
    const report = await importSelectedFiles([missing, await file('ok.txt', 'selected')], store);
    expect(report).toMatchObject({ imported: 1, errors: [{ name: 'missing.txt', message: expect.stringContaining('could not be read') }] });
    expect(report.errors[0]?.message).not.toContain(directory);
  });

  it('rejects directories and final or ancestor symbolic links', async () => {
    await mkdir(path.join(directory, 'folder.txt'));
    const target = await file('target.txt', 'private fixture');
    await symlink(target, path.join(directory, 'linked.txt'));
    await symlink(directory, path.join(directory, 'linked-folder'), 'dir');
    const report = await importSelectedFiles([path.join(directory, 'folder.txt'), path.join(directory, 'linked.txt'), path.join(directory, 'linked-folder/target.txt')], store);
    expect(report.errors).toHaveLength(3);
    expect(report.errors.map((error) => error.message)).toEqual([expect.stringContaining('regular text'), expect.stringContaining('Symbolic'), expect.stringContaining('Symbolic')]);
    expect(store.list()).toEqual([]);
  });

  it('rejects traversal, relative paths and control characters in selected names', async () => {
    const report = await importSelectedFiles(['relative.txt', directory + '/sub/../traversal.txt', await file('bad\nname.txt', 'text')], store);
    expect(report.errors).toHaveLength(3);
    expect(store.list()).toEqual([]);
  });

  it('rejects an oversized file before indexing', async () => {
    const report = await importSelectedFiles([await file('large.txt', Buffer.alloc(importLimits.fileBytes + 1, 32))], store);
    expect(report.errors[0]?.message).toContain('1 MiB');
    expect(store.list()).toEqual([]);
  });

  it('rejects a batch above count or cumulative bytes before any contribution is stored', async () => {
    await expect(importSelectedFiles(Array(11).fill(path.join(directory, 'unused.txt')), store)).rejects.toThrow('10 files');
    const selected = [];
    for (let i = 0; i < 5; i++) selected.push(await file(`batch-${i}.txt`, Buffer.alloc(900_000, 32)));
    await expect(importSelectedFiles(selected, store)).rejects.toThrow('4 MiB');
    expect(store.list()).toEqual([]);
  });

  it('bounds token and individual word counts, preserving the previous revision on failure', async () => {
    const selected = await file('bounds.txt', 'original');
    await importSelectedFiles([selected], store);
    const original = store.list();
    await writeFile(selected, 'word '.repeat(importLimits.tokens + 1));
    expect((await importSelectedFiles([selected], store)).errors[0]?.message).toContain('50,000');
    await writeFile(selected, 'a'.repeat(importLimits.wordCodePoints + 1));
    expect((await importSelectedFiles([selected], store)).errors[0]?.message).toContain('128-character');
    expect(store.list()).toEqual(original);
  });
});
