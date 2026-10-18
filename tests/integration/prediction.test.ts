// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SourceStore } from '../../src/main/storage/store';
import { importSelectedFiles } from '../../src/main/storage/import';
import { PredictionEngine } from '../../src/main/prediction/engine';
import type { NgramOrder, PredictionRequest } from '../../src/main/prediction/types';

let directory: string;
let store: SourceStore;
let inspection: Database.Database;
let engine: PredictionEngine;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'typenudge-prediction-'));
  const filename = path.join(directory, 'index.sqlite3');
  store = new SourceStore(filename);
  inspection = new Database(filename);
  engine = new PredictionEngine(store.predictionRepository());
});

afterEach(() => {
  inspection.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

function source(key: string, text: string): string {
  store.replace(key, key + '.txt', text);
  return store.list().find((item) => item.name === key + '.txt')!.id;
}

function predict(sourceIds: string[], options: Partial<PredictionRequest> = {}) {
  return engine.predict({ prefix: '', context: [], sourceIds, enabledN: [1, 2, 3], ...options });
}

function words(result: ReturnType<typeof predict>): string[] {
  return result.candidates.map((candidate) => candidate.word);
}

describe('real SQLite prediction and source frequencies', () => {
  it('returns no candidates for empty, unknown or disabled-only selections and corpora', () => {
    const empty = source('empty', '');
    const other = source('other', 'visible words');
    inspection.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(other);
    for (const ids of [[], [empty], [other], ['11111111-1111-4111-8111-111111111111']]) {
      expect(predict(ids).candidates).toEqual([]);
    }
  });

  it.each<[NgramOrder[], NgramOrder]>([
    [[1], 1], [[2], 2], [[3], 3], [[1, 2], 2], [[1, 3], 3], [[2, 3], 3], [[1, 2, 3], 3],
  ])('honors the enabled N selection %j', (enabledN, order) => {
    const id = source('context', 'we write calmly. they write boldly. spare spare spare spare');
    const result = predict([id], { context: ['we', 'write'], enabledN });
    expect(result.order).toBe(order);
    expect(words(result)[0]).toBe(order === 3 ? 'calmly' : order === 2 ? 'boldly' : 'spare');
    if (order === 3) expect(result.candidates).toHaveLength(1);
  });

  it('backs off on a prefix miss, including skipping a disabled bigram with an actual match', () => {
    const id = source('fallback', 'we write calmly. they write boldly. boldest boldest boldest');
    expect(words(predict([id], { context: ['we', 'write'], prefix: 'bo' }))).toEqual(['boldly']);
    const skip = predict([id], { context: ['we', 'write'], prefix: 'bo', enabledN: [1, 3] });
    expect(skip.order).toBe(1);
    expect(words(skip)).toEqual(['boldest', 'boldly']);
    expect(predict([id], { context: ['we', 'write'], prefix: 'bo', enabledN: [3] }).candidates).toEqual([]);
  });

  it('ranks exact aggregate frequencies, with binary ties and at most three unique candidates', () => {
    const first = source('first', 'apple apple banana pear apple banana');
    const second = source('second', 'banana banana apricot apricot apricot apple');
    expect(predict([first, second], { enabledN: [1] }).candidates).toEqual([
      { word: 'apple', display: 'apple', frequency: 4 },
      { word: 'banana', display: 'banana', frequency: 4 },
      { word: 'apricot', display: 'apricot', frequency: 3 },
    ]);
    expect(words(predict([second, first, first], { enabledN: [1] }))).toEqual(['apple', 'banana', 'apricot']);
    expect(words(predict([first], { prefix: 'ap' }))).toEqual(['apple']);
  });

  it('does not pretruncate each source before aggregating shared candidates', () => {
    const first = source('first', 'alfa alfa alfa alfa alfa. beta beta beta beta beta. delta delta delta delta delta. shared shared shared shared.');
    const second = source('second', 'echo echo echo echo echo. foxtrot foxtrot foxtrot foxtrot foxtrot. golf golf golf golf golf. shared shared shared shared.');
    expect(predict([first, second], { enabledN: [1] }).candidates[0]).toEqual({ word: 'shared', display: 'shared', frequency: 8 });
  });

  it('filters every order by both requested IDs and persisted source activation', () => {
    const selected = source('selected', 'we write visible.');
    const disabled = source('disabled', 'we write hidden. we write hidden. we write hidden.');
    const unselected = source('unselected', 'we write secret. we write secret.');
    inspection.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(disabled);
    for (const n of [1, 2, 3] as const) {
      expect(words(predict([selected, disabled], { prefix: 'h', context: ['we', 'write'], enabledN: [n] }))).toEqual([]);
      expect(words(predict([selected, disabled], { prefix: 's', context: ['we', 'write'], enabledN: [n] }))).toEqual([]);
    }
    expect(words(predict([unselected], { prefix: 's' }))).toEqual(['secret']);
  });

  it('normalizes multilingual prefixes/context and retains deterministic original display spelling', () => {
    const hu = source('hu', 'A\u0301rvíz árvíz árnyék. én írok Őszintén.');
    const ro = source('ro', 'Știință știință. eu scriu Științific.');
    expect(predict([hu], { prefix: 'A\u0301R' }).candidates).toEqual([
      { word: 'árvíz', display: 'Árvíz', frequency: 2 }, { word: 'árnyék', display: 'árnyék', frequency: 1 },
    ]);
    expect(words(predict([hu], { prefix: 'Ő', context: ['ÉN', 'ÍROK'] }))).toEqual(['őszintén']);
    expect(words(predict([ro], { prefix: 'ȘTIIN', context: ['EU', 'SCRIU'] }))).toEqual(['științific']);
    const display = source('case', 'ÁRVÍZ.');
    expect(predict([hu, display], { prefix: 'ár' }).candidates[0]?.display).toBe('ÁRVÍZ');
  });

  it('matches supplementary Unicode letters, expanding lowercase keys and partial apostrophes', () => {
    const id = source('unicode', "𐐀𐐁 𐐀𐐂. İzmir. Don't don’t donation.");
    expect(words(predict([id], { prefix: '𐐀' }))).toEqual(['𐐨𐐩', '𐐨𐐪']);
    expect(words(predict([id], { prefix: 'İ' }))).toEqual(['i\u0307zmir']);
    expect(predict([id], { prefix: 'DON’' }).candidates).toEqual([{ word: "don't", display: "Don't", frequency: 2 }]);
  });

  it('omits a fully typed word, returns proper longer completions and handles one-word sources', () => {
    const id = source('single', 'the. there. thermal.');
    expect(words(predict([id], { prefix: 'the' }))).toEqual(['there', 'thermal']);
    expect(predict([id], { prefix: 'thermal' }).candidates).toEqual([]);
    const alone = source('alone', 'hello');
    expect(words(predict([alone]))).toEqual(['hello']);
    expect(words(predict([alone], { prefix: 'he' }))).toEqual(['hello']);
    expect(predict([alone], { prefix: 'hello' }).candidates).toEqual([]);
  });

  it('never finds context across sentence, line or document boundaries', () => {
    const first = source('first', 'alpha beta. gamma delta\nnext line');
    const second = source('second', 'joined end');
    for (const context of [['beta'], ['delta'], ['line'], ['beta', 'gamma'], ['line', 'joined']]) {
      expect(predict([first, second], { context, enabledN: [context.length === 1 ? 2 : 3] }).candidates).toEqual([]);
    }
    expect(words(predict([first], { context: ['gamma'], enabledN: [2] }))).toEqual(['delta']);
    expect(() => predict([first], { context: ['beta.'] })).toThrow('completed words');
  });

  it('uses the source/context/candidate primary key for prefix range scans', () => {
    const id = source('plan', 'we write words.');
    const statements: string[] = [];
    const original = inspection.prepare;
    const spy = vi.spyOn(Database.prototype, 'prepare').mockImplementation(function (this: Database.Database, sql: string) {
      statements.push(sql);
      return original.call(this, sql);
    });
    try { new PredictionEngine(store.predictionRepository()).predict({ prefix: 'w', context: ['we', 'write'], sourceIds: [id], enabledN: [3] }); }
    finally { spy.mockRestore(); }
    const query = statements.find((sql) => sql.includes('SUM(g.frequency)'))!;
    expect(query).toContain('LIMIT 3');
    const plan = inspection.prepare('EXPLAIN QUERY PLAN ' + query).all({ sourceIds: JSON.stringify([id]), n: 3, context: '["we","write"]', prefix: 'w', upper: 'x' }) as { detail: string }[];
    expect(plan.some((row) => /SEARCH g USING PRIMARY KEY.*source_id=.*n=.*context_key=.*next_token>.*next_token</.test(row.detail))).toBe(true);
    expect(plan.some((row) => /SCAN g\b/.test(row.detail))).toBe(false);
  });
});

describe('SQLite revisions and cached predictions', () => {
  it('keeps unchanged imports idempotent and invalidates changed import/reindex/delete results', async () => {
    const selected = path.join(directory, 'chosen.txt');
    writeFileSync(selected, 'alpha alpha beta');
    await importSelectedFiles([selected], store);
    const id = store.list()[0]!.id;
    const first = predict([id], { enabledN: [1] });
    await importSelectedFiles([selected], store);
    expect(predict([id], { enabledN: [1] })).toBe(first);
    writeFileSync(selected, 'gamma gamma');
    await importSelectedFiles([selected], store);
    const changed = predict([id], { enabledN: [1] });
    expect(words(changed)).toEqual(['gamma']);
    expect(changed.indexRevision).toBeGreaterThan(first.indexRevision);
    store.reindex(id);
    const reindexed = predict([id], { enabledN: [1] });
    expect(reindexed).not.toBe(changed);
    expect(reindexed.candidates).toEqual(changed.candidates);
    store.delete(id);
    expect(predict([id], { enabledN: [1] }).candidates).toEqual([]);
  });

  it('never reuses cached active-source results after a flag changes without an index revision', () => {
    const id = source('activation', 'active active');
    const before = predict([id]);
    inspection.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(id);
    const disabled = predict([id]);
    expect(disabled.indexRevision).toBe(before.indexRevision);
    expect(disabled.candidates).toEqual([]);
    inspection.prepare('UPDATE sources SET enabled = 1 WHERE id = ?').run(id);
    expect(words(predict([id]))).toEqual(['active']);
  });

  it('keeps source and N settings independent in cached answers', () => {
    const first = source('first', 'we write alpha. we write alpha.');
    const second = source('second', 'they write beta. they write beta.');
    const options = { prefix: '', context: ['we', 'write'] };
    expect(words(predict([first], options))).toEqual(['alpha']);
    expect(words(predict([second], options))).toEqual(['beta']);
    expect(words(predict([first, second], { ...options, enabledN: [2] }))).toEqual(['alpha', 'beta']);
    expect(words(predict([first, second], { ...options, enabledN: [1] }))).toEqual(['write', 'alpha', 'beta']);
  });

  it('uses one consistent read snapshot if another connection disables a source mid-request', () => {
    const id = source('snapshot', 'consistent');
    const repository = store.predictionRepository();
    repository.read([id], (snapshot) => {
      inspection.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(id);
      expect(snapshot.select(1, '', '')).toEqual([{ word: 'consistent', display: 'consistent', frequency: 1 }]);
    });
    expect(predict([id]).candidates).toEqual([]);
  });

  it('preserves previous cached results and revisions after a failed transactional replacement', () => {
    const id = source('rollback', 'previous previous');
    const before = predict([id]);
    inspection.exec("CREATE TRIGGER refuse_count BEFORE INSERT ON ngrams WHEN new.next_token = 'rejected' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    expect(() => store.replace('rollback', 'rollback.txt', 'rejected')).toThrow();
    expect(predict([id])).toBe(before);
    expect(words(predict([id]))).toEqual(['previous']);
  });
});
