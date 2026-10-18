// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
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
  it('persists source/N preferences across reopen without enabling learning or changing counts', () => {
    store.replace('settings-fixture', 'fixture.txt', 'we write words');
    const source = store.list()[0]!;
    const counts = grams(source.id, 2);
    expect(store.getPredictionSettings()).toEqual({ sourceMode: 'imported', enabledN: [1, 2, 3] });
    expect(store.setPredictionSettings({ sourceMode: 'combined', enabledN: [3, 1] })).toEqual({ sourceMode: 'combined', enabledN: [1, 3] });
    expect(() => store.setPredictionSettings({ sourceMode: 'personal', enabledN: [] })).toThrow();
    expect(store.getPredictionSettings()).toEqual({ sourceMode: 'combined', enabledN: [1, 3] });
    expect(inspection.prepare("SELECT value FROM settings WHERE key = 'personalLearning'").get()).toEqual({ value: 'false' });
    expect(grams(source.id, 2)).toEqual(counts);
    store.close();
    store = new SourceStore(path.join(directory, 'sources.sqlite3'));
    expect(store.getPredictionSettings()).toEqual({ sourceMode: 'combined', enabledN: [1, 3] });
  });

  it('toggles only the selected source, preserving all counts/revisions and applying every source mode', () => {
    store.replace('a', 'a.txt', 'we write words');
    store.replace('b', 'b.txt', 'other corpus');
    const [first, second] = store.list() as [NonNullable<ReturnType<SourceStore['list']>[0]>, NonNullable<ReturnType<SourceStore['list']>[0]>];
    const originalCounts = grams(first.id, 2), otherCounts = grams(second.id, 1);
    const indexRevision = revision();
    expect(store.setEnabled(first.id, false)).toEqual({ ...first, enabled: false });
    expect(revision()).not.toBe(indexRevision);
    const after = revision();
    store.setEnabled(first.id, false);
    expect(revision()).toBe(after);
    expect(store.list().find((source) => source.id === second.id)).toEqual(second);
    expect(grams(first.id, 2)).toEqual(originalCounts); expect(grams(second.id, 1)).toEqual(otherCounts);
    expect(store.predictionSourceIds('imported')).toEqual([second.id]);
    expect(store.predictionSourceIds('personal')).toEqual([]);
    inspection.prepare("UPDATE sources SET kind = 'personal' WHERE id = ?").run(second.id);
    store.personal.setLearning(true);
    expect(store.predictionSourceIds('imported')).toEqual([]);
    expect(store.predictionSourceIds('personal')).toEqual([second.id]);
    expect(store.predictionSourceIds('combined')).toEqual([second.id]);
    expect(() => store.setEnabled(second.id, false)).toThrow('no longer exists');
    store.setEnabled(first.id, true);
    expect(store.predictionSourceIds('combined')).toEqual([first.id, second.id].sort());
  });

  it('rolls back both preference fields together on a failed settings write', () => {
    inspection.exec("CREATE TRIGGER reject_setting BEFORE UPDATE ON settings WHEN new.key = 'enabledN' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    expect(() => store.setPredictionSettings({ sourceMode: 'combined', enabledN: [2] })).toThrow();
    expect(store.getPredictionSettings()).toEqual({ sourceMode: 'imported', enabledN: [1, 2, 3] });
  });

  it('migrates a persistent DB with consent off, all N sizes, constraints and lookup indexes', () => {
    expect(inspection.pragma('user_version', { simple: true })).toBe(3);
    expect(inspection.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(inspection.prepare("SELECT value FROM settings WHERE key = 'personalLearning'").get()).toEqual({ value: 'false' });
    expect(inspection.prepare("SELECT value FROM settings WHERE key = 'enabledN'").get()).toEqual({ value: '[1,2,3]' });
    expect(inspection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all())
      .toEqual(['documents', 'imported_files', 'ngrams', 'personal_documents', 'settings', 'sources'].map((name) => ({ name })));
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
    inspection.pragma('user_version = 4');
    expect(() => new SourceStore(path.join(directory, 'sources.sqlite3'))).toThrow('newer version');
    expect(inspection.pragma('user_version', { simple: true })).toBe(4);
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

  it.each([
    ['word separators', 'árvíz\0tükör\u0007gép\u007fpróba\u0080szöveg\u009fvége', 'árvíz tükör gép próba szöveg vége'],
    ['page and line controls', 'one two\fone two\vone two\u0085one two', 'one two\none two\none two\none two'],
    ['Unicode line and paragraph separators', 'one two\u2028one two\u2029one two', 'one two\none two\none two'],
    ['ordinary whitespace', 'árvíz\t\ttükör\r\nkövetkező\n\nsor', 'árvíz\t\ttükör\r\nkövetkező\n\nsor'],
  ])('cleans %s without changing the selected file or inflating reimports', async (_name, original, cleaned) => {
    const selected = await file('controls.txt', original);
    expect(await importSelectedFiles([selected], store)).toMatchObject({ imported: 1, errors: [] });
    expect(inspection.prepare('SELECT body_text AS text, byte_length AS bytes FROM documents').get())
      .toEqual({ text: cleaned, bytes: Buffer.byteLength(cleaned) });
    expect(await readFile(selected, 'utf8')).toBe(original);
    const source = store.list()[0]!;
    const originalCounts = [1, 2, 3].map((n) => grams(source.id, n));
    expect(await importSelectedFiles([selected], store)).toMatchObject({ unchanged: 1, errors: [] });
    await writeFile(selected, cleaned);
    expect(await importSelectedFiles([selected], store)).toMatchObject({ unchanged: 1, errors: [] });
    await rm(selected);
    expect(store.reindex(source.id)).toMatchObject({ contentHash: source.contentHash, revision: 2 });
    expect([1, 2, 3].map((n) => grams(source.id, n))).toEqual(originalCounts);
  });

  it('cleans all C0/C1 controls while keeping page boundaries out of N-grams', async () => {
    const codes = [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127)]
      .filter((code) => ![9, 10, 13].includes(code));
    const original = codes.map((code) => `left${String.fromCodePoint(code)}right`).join('\n');
    const cleaned = codes.map((code) => [11, 12, 133].includes(code) ? 'left\nright' : 'left right').join('\n');
    expect(await importSelectedFiles([await file('all-controls.txt', original)], store)).toMatchObject({ imported: 1, errors: [] });
    const source = store.list()[0]!;
    expect(source.tokenCount).toBe(codes.length * 2);
    expect(inspection.prepare('SELECT body_text AS text FROM documents').get()).toEqual({ text: cleaned });
    expect(inspection.prepare('SELECT frequency FROM ngrams WHERE n = 2').all()).toEqual([{ frequency: codes.length - 3 }]);
    expect(grams(source.id, 3)).toEqual([]);
  });

  it('accepts Unicode format marks, unusual spaces and symbols without indexing them as words', async () => {
    const separators = ['\u00ad', '\u200b', '\u200c', '\u200d', '\u200e', '\u200f', '\u202a', '\u202b', '\u202c',
      '\u202d', '\u202e', '\u2060', '\u2066', '\u2067', '\u2068', '\u2069', '\ufeff', '\u00a0', '\u1680',
      '\u2000', '\u2009', '\u202f', '\u205f', '\u3000', '🙂', '★'];
    const text = separators.map((separator) => `árvíz${separator}tükör`).join('\n');
    const selected = await file('unicode-marks.md', text);
    expect(await importSelectedFiles([selected], store)).toMatchObject({ imported: 1, errors: [] });
    const source = store.list()[0]!;
    expect(source.tokenCount).toBe(separators.length * 2);
    expect(grams(source.id, 1)).toEqual([
      { context_key: '', next_token: 'tükör', display_token: 'tükör', frequency: separators.length },
      { context_key: '', next_token: 'árvíz', display_token: 'árvíz', frequency: separators.length },
    ]);
    expect(inspection.prepare('SELECT body_text AS text FROM documents').get()).toEqual({ text });
    expect(await readFile(selected, 'utf8')).toBe(text);
  });

  it('enforces the raw selection budget even when cleanup shrinks stored UTF-8 text', async () => {
    const selected: string[] = [];
    const controls = '\u009f'.repeat(Math.floor(importLimits.batchBytes / 5 / 2) + 1);
    for (let i = 0; i < 5; i++) selected.push(await file(`raw-controls-${i}.txt`, controls));
    await expect(importSelectedFiles(selected, store)).rejects.toThrow('10 MiB');
    expect(store.list()).toEqual([]);
  });

  it('returns per-file recoverable errors while retaining valid selected files', async () => {
    const missing = path.join(directory, 'missing.txt');
    const report = await importSelectedFiles([missing, await file('ok.txt', 'selected')], store);
    expect(report).toMatchObject({ imported: 1, errors: [{ name: 'missing.txt', message: expect.stringContaining('could not be read') }] });
    expect(report.errors[0]?.message).not.toContain(directory);
  });

  it('rejects directories and final or ancestor links', async () => {
    await mkdir(path.join(directory, 'folder.txt'));
    const target = await file('target.txt', 'private fixture');
    // Windows junctions exercise both link positions without requiring symlink privileges.
    await symlink(process.platform === 'win32' ? directory : target, path.join(directory, 'linked.txt'),
      process.platform === 'win32' ? 'junction' : 'file');
    await symlink(directory, path.join(directory, 'linked-folder'), process.platform === 'win32' ? 'junction' : 'dir');
    const report = await importSelectedFiles([path.join(directory, 'folder.txt'), path.join(directory, 'linked.txt'), path.join(directory, 'linked-folder/target.txt')], store);
    expect(report.errors).toHaveLength(3);
    expect(report.errors.map((error) => error.message)).toEqual([expect.stringContaining('regular text'), expect.stringContaining('Symbolic'), expect.stringContaining('Symbolic')]);
    expect(store.list()).toEqual([]);
  });

  it('rejects traversal, relative paths and control characters in selected names', async () => {
    const report = await importSelectedFiles(['relative.txt', directory + '/sub/../traversal.txt', path.join(directory, 'bad\nname.txt')], store);
    expect(report.errors).toHaveLength(3);
    expect(report.errors.every((error) => error.message === 'The selected filename is not supported.')).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('rejects an oversized file before indexing', async () => {
    const report = await importSelectedFiles([await file('large.txt', Buffer.alloc(importLimits.fileBytes + 1, 32))], store);
    expect(report.errors[0]?.message).toContain('5 MiB');
    expect(store.list()).toEqual([]);
  });

  it('rejects a batch above count or cumulative bytes before any contribution is stored', async () => {
    await expect(importSelectedFiles(Array(11).fill(path.join(directory, 'unused.txt')), store)).rejects.toThrow('10 files');
    const selected = [];
    for (let i = 0; i < 5; i++) selected.push(await file(`batch-${i}.txt`, Buffer.alloc(Math.floor(importLimits.batchBytes / 5) + 1, 32)));
    await expect(importSelectedFiles(selected, store)).rejects.toThrow('10 MiB');
    expect(store.list()).toEqual([]);
  });

  it('bounds token and individual word counts, preserving the previous revision on failure', async () => {
    const selected = await file('bounds.txt', 'original');
    await importSelectedFiles([selected], store);
    const original = store.list();
    await writeFile(selected, 'word '.repeat(importLimits.tokens + 1));
    expect((await importSelectedFiles([selected], store)).errors[0]?.message).toContain('250,000');
    await writeFile(selected, 'a'.repeat(importLimits.wordCodePoints + 1));
    expect((await importSelectedFiles([selected], store)).errors[0]?.message).toContain('128-character');
    expect(store.list()).toEqual(original);
  });

  it.each([102_400, 250_000])('imports %i words completely and keeps reimport/reindex counts stable', async (tokens) => {
    const body = 'word '.repeat(tokens);
    const selected = await file('large-valid.txt', body);
    expect(await importSelectedFiles([selected], store)).toMatchObject({ imported: 1, errors: [] });
    const source = store.list()[0]!;
    expect(source.tokenCount).toBe(tokens);
    expect(inspection.prepare('SELECT body_text AS text, byte_length AS bytes FROM documents WHERE source_id = ?').get(source.id))
      .toEqual({ text: body, bytes: tokens * 5 });
    const expected = [1, 2, 3].map((n) => ({ n, frequency: tokens - n + 1 }));
    const frequencies = () => inspection.prepare('SELECT n, frequency FROM ngrams WHERE source_id = ? ORDER BY n').all(source.id);
    expect(frequencies()).toEqual(expected);
    expect(await importSelectedFiles([selected], store)).toMatchObject({ imported: 0, unchanged: 1, errors: [] });
    expect(store.list()).toEqual([source]);
    await rm(selected);
    expect(store.reindex(source.id)).toMatchObject({ revision: 2, tokenCount: tokens, contentHash: source.contentHash });
    expect(frequencies()).toEqual(expected);
  });

  it('accepts exact 5 MiB files and a 10 MiB selection without truncation', async () => {
    const header = 'we write words.\n';
    const body = header + ' '.repeat(importLimits.fileBytes - Buffer.byteLength(header));
    const selected = [await file('five-a.txt', body), await file('five-b.md', body)];
    expect(await importSelectedFiles(selected, store)).toMatchObject({ imported: 2, errors: [] });
    expect(store.list().map((source) => source.tokenCount)).toEqual([3, 3]);
    expect(inspection.prepare('SELECT SUM(byte_length) AS bytes FROM documents').get()).toEqual({ bytes: importLimits.batchBytes });
    expect(inspection.prepare('SELECT body_text AS text FROM documents LIMIT 1').get()).toEqual({ text: body });
  });
});
