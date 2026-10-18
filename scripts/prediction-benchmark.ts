// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { defaultNgramScales } from '../src/shared/prediction';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { SourceStore } from '../src/main/storage/store';
import { PredictionEngine } from '../src/main/prediction/engine';
import type { PredictionRequest } from '../src/main/prediction/types';

function summary(samples: number[]): { medianMs: number; p95Ms: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const rounded = (value: number) => Number(value.toFixed(4));
  return { medianMs: rounded(sorted[Math.floor(sorted.length / 2)]!), p95Ms: rounded(sorted[Math.ceil(sorted.length * 0.95) - 1]!) };
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const probe = new Database(':memory:');
const sqlite = probe.prepare('SELECT sqlite_version() AS version').get() as { version: string };
probe.close();
console.log(JSON.stringify({ environment: { cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
  memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)), node: process.version, sqlite: sqlite.version,
  os: os.platform(), kernel: os.release(), architecture: os.arch() }, indexingSamples: 5, lruClearedSamples: 100, warmSamples: 1000 }));

function indexing(directory: string, body: string, sentences: number): void {
  const initial: number[] = [], reindex: number[] = [];
  for (let sample = 0; sample < 5; sample++) {
    // Schema creation/DB open is outside timing. Each sample starts with an empty index.
    const store = new SourceStore(path.join(directory, `indexing-${sample}.sqlite3`));
    try {
      const start = performance.now();
      const results = [store.replace('a', 'a.txt', body), store.replace('b', 'b.txt', body)];
      initial.push(performance.now() - start);
      assert.deepEqual(results, ['imported', 'imported']);
      const before = store.list();
      assert.equal(before.length, 2);
      assert.ok(before.every((source) => source.tokenCount === sentences * 3 && source.contentHash === hash(body)));
      const reindexStart = performance.now();
      for (const source of before) store.reindex(source.id);
      reindex.push(performance.now() - reindexStart);
      const after = store.list();
      assert.deepEqual(after.map((source) => source.revision), before.map((source) => source.revision + 1));
      assert.deepEqual(after.map((source) => [source.id, source.contentHash, source.tokenCount]),
        before.map((source) => [source.id, source.contentHash, source.tokenCount]));
      const engine = new PredictionEngine(store.predictionRepository(),128,()=>0);
      assert.deepEqual(engine.predict({ngramScales:defaultNgramScales, prefix: 'wo', context: ['we', 'write'], sourceIds: after.map((source) => source.id), maxN:7, poolSize:3, previewWords:3 })
        .candidates.map((candidate) => candidate.word), ['word0', 'word1', 'word10']);
    } finally { store.close(); }
  }
  console.log(JSON.stringify({ kind: 'indexing', sourceCount: 2, tokens: sentences * 6, utf8Bytes: Buffer.byteLength(body) * 2,
    initial: summary(initial), reindex: summary(reindex) }));
}

for (const sentences of [100, 5000]) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'typenudge-prediction-benchmark-'));
  const store = new SourceStore(path.join(directory, 'index.sqlite3'));
  try {
    const body = Array.from({ length: sentences }, (_, i) => `we write word${i % 500}.`).join('\n');
    const original = hash(body);
    indexing(directory, body, sentences);
    store.replace('synthetic-a', 'synthetic-a.txt', body);
    store.replace('synthetic-b', 'synthetic-b.txt', body);
    const sources = store.list();
    const engine = new PredictionEngine(store.predictionRepository(),128,()=>0);
    const base: PredictionRequest = { ngramScales:defaultNgramScales, prefix: '', context: [], sourceIds: sources.map((source) => source.id), maxN:7, poolSize:3, previewWords:3 };
    const cases: { name: string; request: PredictionRequest }[] = [
      { name: 'unigram', request: base },
      { name: 'prefix', request: { ...base, prefix: 'wo' } },
      { name: 'bigram', request: { ...base, prefix: 'wo', context: ['write'] } },
      { name: 'trigram', request: { ...base, prefix: 'wo', context: ['we', 'write'] } },
      { name: 'all-usable-orders', request: { ...base, prefix: 'wo', context: ['missing', 'write'], maxN:3 } },
    ];
    for (const item of cases) {
      const expected = engine.predict(item.request);
      assert.equal(expected.candidates.length, 3);
      assert.deepEqual(expected.candidates.map((candidate) => candidate.word),
        item.name === 'unigram' ? ['we', 'write', 'word0'] : ['word0', 'word1', 'word10']);
      const cold: number[] = [];
      for (let i = 0; i < 100; i++) {
        engine.clearCache();
        const start = performance.now();
        const result = engine.predict(item.request);
        cold.push(performance.now() - start);
        assert.deepEqual(result, expected);
      }
      const warm: number[] = [];
      const primed = engine.predict(item.request);
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        const result = engine.predict(item.request);
        warm.push(performance.now() - start);
        assert.strictEqual(result.candidates, primed.candidates);
      }
      console.log(JSON.stringify({ sourceCount: sources.length, tokens: sentences * 3 * sources.length,
        utf8Bytes: Buffer.byteLength(body) * sources.length, case: item.name, lruCleared: summary(cold), warm: summary(warm),
        maximumN: item.request.maxN, previewWords: item.request.previewWords, candidates: expected.candidates.map((candidate) => candidate.word) }));
    }
    assert.equal(hash(body), original);
    assert.deepEqual(store.list(), sources);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
