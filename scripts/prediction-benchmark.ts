// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { SourceStore } from '../src/main/storage/store';
import { PredictionEngine } from '../src/main/prediction/engine';
import type { NgramOrder, PredictionRequest } from '../src/main/prediction/types';

function summary(samples: number[]): { medianMs: number; p95Ms: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const rounded = (value: number) => Number(value.toFixed(4));
  return { medianMs: rounded(sorted[Math.floor(sorted.length / 2)]!), p95Ms: rounded(sorted[Math.ceil(sorted.length * 0.95) - 1]!) };
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
console.log(JSON.stringify({ environment: { cpu: os.cpus()[0]?.model, node: process.version, os: os.platform(), architecture: os.arch() }, coldSamples: 100, warmSamples: 1000 }));

for (const sentences of [100, 5000]) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'typenudge-prediction-benchmark-'));
  const store = new SourceStore(path.join(directory, 'index.sqlite3'));
  try {
    const body = Array.from({ length: sentences }, (_, i) => `we write word${i % 500}.`).join('\n');
    const original = hash(body);
    store.replace('synthetic-a', 'synthetic-a.txt', body);
    store.replace('synthetic-b', 'synthetic-b.txt', body);
    const sources = store.list();
    const engine = new PredictionEngine(store.predictionRepository());
    const base: PredictionRequest = { prefix: '', context: [], sourceIds: sources.map((source) => source.id), enabledN: [1, 2, 3] };
    const cases: { name: string; request: PredictionRequest; expectedOrder: NgramOrder }[] = [
      { name: 'unigram', request: base, expectedOrder: 1 },
      { name: 'prefix', request: { ...base, prefix: 'wo' }, expectedOrder: 1 },
      { name: 'bigram', request: { ...base, prefix: 'wo', context: ['write'] }, expectedOrder: 2 },
      { name: 'trigram', request: { ...base, prefix: 'wo', context: ['we', 'write'] }, expectedOrder: 3 },
      { name: 'enabled-only-backoff', request: { ...base, prefix: 'wo', context: ['missing', 'write'], enabledN: [1, 3] }, expectedOrder: 1 },
    ];
    for (const item of cases) {
      const expected = engine.predict(item.request);
      assert.equal(expected.order, item.expectedOrder);
      assert.equal(expected.candidates.length, 3);
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
        assert.strictEqual(result, primed);
      }
      console.log(JSON.stringify({ sourceCount: sources.length, tokens: sentences * 3 * sources.length,
        utf8Bytes: Buffer.byteLength(body) * sources.length, case: item.name, cold: summary(cold), warm: summary(warm),
        order: expected.order, candidates: expected.candidates.map((candidate) => candidate.word) }));
    }
    assert.equal(hash(body), original);
    assert.deepEqual(store.list(), sources);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
