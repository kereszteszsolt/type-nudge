// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SourceStore } from '../../src/main/storage/store';
import { importSelectedFiles } from '../../src/main/storage/import';
import { clearUnavailableSource, listSourceFiles } from '../../src/main/storage/source-files';
import { PredictionEngine } from '../../src/main/prediction/engine';

let directory: string, filename: string, store: SourceStore, db: Database.Database;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'typenudge-source-files-'));
  filename = path.join(directory, 'store.sqlite3'); store = new SourceStore(filename); db = new Database(filename);
});
afterEach(async () => { db.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
async function imported(name = 'chosen.txt', text = 'onlysource word sample') {
  const selected = path.join(directory, name); await writeFile(selected, text);
  expect(await importSelectedFiles([selected], store)).toMatchObject({ imported: 1, errors: [] });
  return { selected, source: store.list().find((item) => item.name === name)! };
}
function counts(id: string) { return db.prepare('SELECT * FROM ngrams WHERE source_id = ? ORDER BY n, context_key, next_token').all(id); }
function personalSource(id: string): string { return (db.prepare('SELECT source_id AS id FROM personal_documents WHERE id = ?').get(id) as { id: string }).id; }
function revision() { return (db.prepare("SELECT value FROM settings WHERE key = 'indexRevision'").get() as { value: string }).value; }

it('persists an authorized canonical location without exposing it in source summaries', async () => {
  const { selected, source } = await imported();
  expect(store.originalFile(source.id)).toEqual({ path: await realpath(selected), hasIndex: true });
  store.close(); store = new SourceStore(filename);
  const listed = await listSourceFiles(store);
  expect(listed).toEqual([{ ...source, fileStatus: 'available', hasIndex: true }]);
  expect(JSON.stringify(listed)).not.toContain(selected);
  expect(JSON.stringify(store.list())).not.toContain('original_path');
});

it('clears only an unavailable indexed import, cascading all local contributions and invalidating cached predictions', async () => {
  const { selected, source } = await imported(); const other = await imported('other.txt', 'remaining text source');
  store.personal.setLearning(true);
  const note = store.personal.save({ id: null, revision: null, name: 'Note', text: 'personal words preserved' });
  const otherCounts = counts(other.source.id), personalCounts = counts(personalSource(note.id));
  const engine = new PredictionEngine(store.predictionRepository());
  const request = { prefix: 'on', context: [], enabledN: [1] as const, sourceIds: [source.id, other.source.id] };
  expect(engine.predict({ ...request, enabledN: [1] }).candidates.map((item) => item.word)).toEqual(['onlysource']);
  await rm(selected);
  expect((await listSourceFiles(store)).find((item) => item.id === source.id)).toMatchObject({ fileStatus: 'missing', hasIndex: true });
  const before = Number(revision());
  await clearUnavailableSource(store, source.id);
  expect(Number(revision())).toBe(before + 1);
  for (const table of ['sources', 'documents', 'ngrams', 'imported_files']) {
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${table === 'sources' ? 'id' : 'source_id'} = ?`).get(source.id)).toEqual({ count: 0 });
  }
  expect(engine.predict({ ...request, enabledN: [1] }).candidates).toEqual([]);
  expect(counts(other.source.id)).toEqual(otherCounts); expect(counts(personalSource(note.id))).toEqual(personalCounts);
  expect(store.personal.open(note.id).text).toBe('personal words preserved');
  expect(await readFile(other.selected, 'utf8')).toBe('remaining text source');
});

it('refuses cleanup if a file is readable or was restored after the list was checked', async () => {
  const { selected, source } = await imported(); const before = counts(source.id), indexRevision = revision();
  await expect(clearUnavailableSource(store, source.id)).rejects.toThrow('original file is unavailable');
  await rm(selected);
  expect((await listSourceFiles(store))[0]!.fileStatus).toBe('missing');
  await writeFile(selected, 'restored original');
  await expect(clearUnavailableSource(store, source.id)).rejects.toThrow('original file is unavailable');
  expect(store.list()).toEqual([source]); expect(counts(source.id)).toEqual(before); expect(revision()).toBe(indexRevision);
  expect(await readFile(selected, 'utf8')).toBe('restored original');
});

it('migrates schema 2 losslessly and backfills unknown locations on an unchanged explicit reimport', async () => {
  const { selected, source } = await imported();
  store.personal.setLearning(true);
  const note = store.personal.save({ id: null, revision: null, name: 'Note', text: 'saved personal text' });
  const before = counts(source.id), personalCounts = counts(personalSource(note.id)), indexRevision = revision();
  db.exec('DROP TABLE imported_files; PRAGMA user_version = 2;');
  store.close(); store = new SourceStore(filename);
  expect(db.pragma('user_version', { simple: true })).toBe(3);
  expect(await listSourceFiles(store)).toEqual([{ ...source, fileStatus: 'unknown', hasIndex: true }]);
  await expect(clearUnavailableSource(store, source.id)).rejects.toThrow('original file is unavailable');
  expect(await importSelectedFiles([selected], store)).toMatchObject({ imported: 0, unchanged: 1, errors: [] });
  expect(store.list()).toEqual([source]); expect(counts(source.id)).toEqual(before); expect(revision()).toBe(indexRevision);
  expect(counts(personalSource(note.id))).toEqual(personalCounts); expect(store.personal.open(note.id)).toMatchObject({ text: 'saved personal text' });
  expect((await listSourceFiles(store))[0]!.fileStatus).toBe('available');
});

it('does not offer indexed cleanup for a missing empty import', async () => {
  const { selected, source } = await imported('empty.txt', ''); await rm(selected);
  expect(await listSourceFiles(store)).toEqual([{ ...source, fileStatus: 'missing', hasIndex: false }]);
  await expect(clearUnavailableSource(store, source.id)).rejects.toThrow('stored index exists');
  expect(store.list()).toEqual([source]);
});

it('allows local cleanup when the original file became a directory, without touching that directory', async () => {
  const { selected, source } = await imported(); await rm(selected); await mkdir(selected);
  await writeFile(path.join(selected, 'untouched.txt'), 'keep');
  expect((await listSourceFiles(store))[0]!.fileStatus).toBe('unavailable');
  await clearUnavailableSource(store, source.id);
  expect(store.list()).toEqual([]); expect(await readFile(path.join(selected, 'untouched.txt'), 'utf8')).toBe('keep');
});

it('rejects personal or nonexistent IDs and rolls file-location writes back with failed indexing', async () => {
  const note = store.personal.save({ id: null, revision: null, name: 'Note', text: 'keep' });
  await expect(clearUnavailableSource(store, personalSource(note.id))).rejects.toThrow('no longer exists');
  await expect(clearUnavailableSource(store, 'missing')).rejects.toThrow('no longer exists');
  const { selected, source } = await imported();
  const key = createHash('sha256').update(process.platform === 'win32' ? (await realpath(selected)).toLowerCase() : await realpath(selected)).digest('hex');
  db.exec("CREATE TRIGGER reject_count BEFORE INSERT ON ngrams BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
  expect(() => store.replace(key, source.name, 'changed', path.join(directory, 'other.txt'))).toThrow();
  expect(store.originalFile(source.id).path).toBe(await realpath(selected)); expect(store.list()).toEqual([source]);
});
