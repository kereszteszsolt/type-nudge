// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SourceStore } from '../../src/main/storage/store';
import { PredictionEngine } from '../../src/main/prediction/engine';
import type { DocumentSummary, SaveDocument } from '../../src/shared/documents';
import type { SourceMode } from '../../src/shared/prediction';

let directory: string, filename: string, store: SourceStore, db: Database.Database, engine: PredictionEngine;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'typenudge-personal-')); filename = path.join(directory, 'store.sqlite3');
  store = new SourceStore(filename); db = new Database(filename); engine = new PredictionEngine(store.predictionRepository());
});
afterEach(() => { db.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
function save(text: string, previous?: DocumentSummary, name = 'Personal note') {
  return store.personal.save({ id: previous?.id ?? null, revision: previous?.revision ?? null, name, text });
}
function predict(mode: SourceMode = 'personal', prefix = '') {
  return engine.predict({ prefix, context: [], sourceIds: store.predictionSourceIds(mode), enabledN: [1, 2, 3] });
}
function counts(kind = 'personal') { return db.prepare('SELECT g.* FROM ngrams g JOIN sources s ON s.id = g.source_id WHERE s.kind = ? ORDER BY source_id, n, context_key, next_token').all(kind); }

it('saves/reopens plain Unicode text with default learning off and zero contributions', () => {
  expect(store.personal.list()).toEqual({ learning: false, documents: [] });
  const text = 'A\u0301rvíz\r\n<script>literal</script> 日本語';
  const note = save(text);
  expect(note).toMatchObject({ name: 'Personal note', revision: 1, enabled: true, learned: false, tokenCount: 0 });
  expect(store.personal.open(note.id)).toEqual({ ...note, text }); expect(counts()).toEqual([]);
  expect(predict().candidates).toEqual([]);
  expect(save(text, note)).toEqual(note);
  store.personal.setLearning(true);
  expect(counts()).toEqual([]); // Enabling never indexes previously saved notes.
});
it('replaces learned N=1/2/3 contributions and makes unchanged saves idempotent', () => {
  store.personal.setLearning(true);
  const first = save('we write words. we write words.');
  expect(first).toMatchObject({ learned: true, tokenCount: 6 });
  const original = counts(); const before = predict();
  expect(save('we write words. we write words.', first)).toEqual(first);
  expect(counts()).toEqual(original); expect(predict()).toBe(before);
  const second = save('Új szöveg most.', first);
  expect(second.revision).toBe(2);
  expect(predict('personal', 'wo').candidates).toEqual([]);
  expect(counts().map((row) => (row as { next_token: string }).next_token)).not.toContain('words');
  expect(db.prepare('SELECT frequency FROM ngrams WHERE n = 3').all()).toEqual([{ frequency: 1 }]);
});
it('learns a 500 KiB note above the old word limit without inflating repeated saves', () => {
  const text = 'word '.repeat(102_400);
  store.personal.setLearning(true);
  const note = save(text);
  expect(note).toMatchObject({ tokenCount: 102_400, learned: true, revision: 1 });
  expect(store.personal.open(note.id).text).toBe(text);
  const frequencies = () => db.prepare('SELECT n, frequency FROM ngrams ORDER BY n').all();
  const expected = [1, 2, 3].map((n) => ({ n, frequency: 102_400 - n + 1 }));
  expect(frequencies()).toEqual(expected);
  expect(save(text, note)).toEqual(note);
  expect(frequencies()).toEqual(expected);
});
it('pauses learning/personal predictions and removes old contributions on a save while off', () => {
  store.personal.setLearning(true); const note = save('private private'); const learned = counts();
  expect(predict().candidates[0]?.word).toBe('private');
  store.personal.setLearning(false);
  expect(predict().candidates).toEqual([]); expect(counts()).toEqual(learned);
  const saved = save('new secret', note);
  expect(saved.learned).toBe(false); expect(counts()).toEqual([]);
  store.personal.setLearning(true);
  expect(predict().candidates).toEqual([]);
  expect(save('new secret', saved).learned).toBe(true);
  expect(predict('personal', 'se').candidates[0]?.word).toBe('secret');
});
it('respects all source modes, per-document activation, and invalidates a warmed cache', () => {
  store.replace('import', 'Import.txt', 'imported');
  store.personal.setLearning(true); const note = save('personal');
  expect(predict('imported').candidates.map((row) => row.word)).toEqual(['imported']);
  expect(predict().candidates.map((row) => row.word)).toEqual(['personal']);
  expect(predict('combined').candidates.map((row) => row.word)).toEqual(['imported', 'personal']);
  store.personal.setEnabled(note.id, false);
  expect(predict().candidates).toEqual([]);
  const changed = save('personal changed', note);
  expect(changed.enabled).toBe(false);
  store.personal.setEnabled(note.id, true);
  expect(predict('personal', 'pe').candidates[0]?.word).toBe('personal');
  store.personal.forget(note.id);
  expect(predict().candidates).toEqual([]);
  expect(store.personal.open(note.id).text).toBe('personal changed');
});
it('forgets/resets/deletes personal data independently, retaining saved text and imported counts', () => {
  store.replace('import', 'Import.txt', 'keep imported'); const imported = counts('imported');
  store.personal.setLearning(true); const a = save('alpha'), b = save('beta', undefined, 'Second');
  store.personal.forget(a.id);
  expect(store.personal.open(a.id).text).toBe('alpha'); expect(predict().candidates[0]?.word).toBe('beta');
  store.personal.reset();
  expect(store.personal.list().learning).toBe(false); expect(store.personal.list().documents).toHaveLength(2);
  expect(counts()).toEqual([]); expect(counts('imported')).toEqual(imported); expect(predict().candidates).toEqual([]);
  store.personal.delete(b.id);
  expect(() => store.personal.open(b.id)).toThrow('no longer exists');
  expect(store.personal.list().documents.map((row) => row.id)).toEqual([a.id]);
  expect(counts('imported')).toEqual(imported);
});
it('persists documents, consent and activation after restart without indexing unsaved text', () => {
  store.personal.setLearning(true); const note = save('árvíz tükör'); store.personal.setEnabled(note.id, false);
  store.close(); store = new SourceStore(filename);
  expect(store.personal.list()).toMatchObject({ learning: true, documents: [{ id: note.id, enabled: false, learned: true }] });
  expect(store.personal.open(note.id).text).toBe('árvíz tükör');
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
});
it('deletes a learned document and invalidates cached predictions without removing another note', () => {
  store.personal.setLearning(true); const a = save('alpha alpha'), b = save('beta', undefined, 'Other');
  expect(predict().candidates[0]?.word).toBe('alpha');
  store.personal.delete(a.id);
  expect(predict().candidates.map((item) => item.word)).toEqual(['beta']);
  expect(store.personal.open(b.id).text).toBe('beta');
  expect(counts()).toHaveLength(1);
  expect(db.prepare('SELECT COUNT(*) AS count FROM personal_documents').get()).toEqual({ count: 1 });
});
it('rolls back saved text, revision, hash and counts together on indexing failure', () => {
  store.personal.setLearning(true); const note = save('old old'); const original = counts(); const cached = predict();
  db.exec("CREATE TRIGGER reject_personal BEFORE INSERT ON ngrams WHEN new.next_token = 'fail' BEGIN SELECT RAISE(ABORT, 'fixture'); END");
  expect(() => save('new fail', note)).toThrow();
  expect(store.personal.open(note.id)).toEqual({ ...note, text: 'old old' });
  expect(counts()).toEqual(original); expect(predict()).toBe(cached);
  expect(() => save('fail', undefined)).toThrow(); expect(store.personal.list().documents).toHaveLength(1);
});
it('rejects stale revisions and resource limits while allowing unlearned long words to be saved', () => {
  const note = save('original'), edited = save('edited', note);
  expect(() => save('stale', note)).toThrow('changed since');
  expect(store.personal.open(note.id).text).toBe('edited');
  expect(() => save('é'.repeat(600_000), edited)).toThrow('1 MiB');
  const long = save('a'.repeat(129), edited); store.personal.setLearning(true);
  expect(() => save('a'.repeat(129), long)).toThrow('128');
  store.personal.setLearning(false);
  expect(save('word '.repeat(50_001), long).learned).toBe(false);
});
it('enforces shared source count and byte budgets for both personal and imported text', () => {
  for (let i = 0; i < 100; i++) save('small', undefined, `Note ${i}`);
  expect(() => save('overflow')).toThrow('limit is 100');
  expect(() => store.replace('over', 'extra.txt', 'extra')).toThrow('source limit');
  const first = store.personal.list().documents[0]!;
  db.prepare('UPDATE personal_documents SET byte_length = ? WHERE id = ?').run(32 * 1024 * 1024, first.id);
  expect(() => store.replace('over', 'extra.txt', 'extra')).toThrow();
});
it('bounds combined stored UTF-8 bytes across imports and personal notes', () => {
  const note = save('small');
  db.prepare('UPDATE personal_documents SET byte_length = ? WHERE id = ?').run(32 * 1024 * 1024, note.id);
  expect(() => save('extra', undefined, 'Extra')).toThrow('32 MiB');
  expect(() => store.replace('extra', 'extra.txt', 'extra')).toThrow('32 MiB');
});
it('migrates schema 1 without altering imported text, preferences or N-gram counts', () => {
  store.replace('import', 'import.txt', 'original corpus'); const sources = store.list(), original = counts('imported');
  db.exec('DROP TABLE imported_files; DROP TABLE personal_documents; PRAGMA user_version = 1;');
  store.close(); store = new SourceStore(filename);
  expect(db.pragma('user_version', { simple: true })).toBe(3);
  expect(store.list()).toEqual(sources); expect(counts('imported')).toEqual(original);
  expect(store.personal.list()).toEqual({ learning: false, documents: [] });
});
it('rejects cross-kind IDs for personal operations and invalid document fields', () => {
  store.replace('import', 'import.txt', 'untouched'); const imported = store.list()[0]!;
  expect(() => store.personal.delete(imported.id)).toThrow('no longer exists');
  const valid: SaveDocument = { id: null, revision: null, name: 'Valid', text: 'text' };
  for (const changes of [{ name: '' }, { name: 'a'.repeat(121) }, { text: '\0' }, { text: '\ud800' }, { revision: 1 }, { path: '/tmp/file' }]) {
    expect(() => store.personal.save({ ...valid, ...changes } as SaveDocument)).toThrow();
  }
  expect(store.list()).toEqual([imported]);
});
