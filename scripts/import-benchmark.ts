// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { SourceStore } from '../src/main/storage/store';
import { importSelectedFiles } from '../src/main/storage/import';
import { PredictionEngine } from '../src/main/prediction/engine';
import { importLimits } from '../src/shared/sources';

interface Fixture { body: string; tokens: number; sentences: number; prefix: string; context: string[]; next: string }

function fixture(name: string): Fixture {
  const header = 'we write words.\n';
  const base = { prefix: 'wo', context: ['we', 'write'], next: 'words' };
  if (name === 'dense-500k') return { body: 'word '.repeat(102_400), tokens: 102_400, sentences: 1,
    prefix: 'wo', context: ['word', 'word'], next: 'word' };
  if (name === 'varied-500k') {
    const words: string[] = [];
    let seed = 42, bytes = Buffer.byteLength(header);
    while (true) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      const word = `szó${((seed >>> 16) % 4096).toString(36)} `;
      const size = Buffer.byteLength(word);
      if (bytes + size > 512_000) break;
      words.push(word); bytes += size;
    }
    return { ...base, prefix: 'szó', body: header + words.join('') + ' '.repeat(512_000 - bytes), tokens: words.length + 3, sentences: 2 };
  }
  if (name === 'unique-125k' || name === 'unique-250k') {
    const tokens = name === 'unique-125k' ? 125_000 : 250_000;
    return { ...base, prefix: 'token', tokens, sentences: 2,
      body: header + Array.from({ length: tokens - 3 }, (_, index) => `token${String(index).padStart(6, '0')}`).join(' ') };
  }
  if (name === 'byte-limit') return { ...base, tokens: 3, sentences: 1,
    body: header + ' '.repeat(importLimits.fileBytes - Buffer.byteLength(header)) };
  throw new Error(`Unknown import benchmark fixture: ${name}`);
}

const rounded = (number: number) => Number(number.toFixed(2));
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

async function main(): Promise<void> {
  const name = process.argv[2] ?? '';
  const input = fixture(name);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'typenudge-import-benchmark-'));
  const selected = path.join(directory, 'synthetic.txt');
  const database = path.join(directory, 'store.sqlite3');
  writeFileSync(selected, input.body);
  const originalHash = hash(input.body);
  const store = new SourceStore(database);
  const inspection = new Database(database, { readonly: true });
  try {
    const started = performance.now();
    const imported = await importSelectedFiles([selected], store);
    const importMs = performance.now() - started;
    assert.deepEqual(imported, { imported: 1, unchanged: 0, canceled: false, errors: [] });
    const before = store.list();
    assert.equal(before.length, 1);
    assert.equal(before[0]!.tokenCount, input.tokens);
    assert.equal(before[0]!.contentHash, originalHash);
    assert.deepEqual(inspection.prepare('SELECT body_text AS text, byte_length AS bytes FROM documents').get(),
      { text: input.body, bytes: Buffer.byteLength(input.body) });
    const stats = () => inspection.prepare('SELECT n, COUNT(*) AS rows, SUM(frequency) AS total FROM ngrams GROUP BY n ORDER BY n')
      .all() as { n: number; rows: number; total: number }[];
    const initialStats = stats();
    assert.deepEqual(initialStats.map(({ n, total }) => [n, total]),
      [1, 2, 3].map((n) => [n, input.tokens - input.sentences * (n - 1)]));

    const repeatedStart = performance.now();
    const repeated = await importSelectedFiles([selected], store);
    const unchangedMs = performance.now() - repeatedStart;
    assert.deepEqual(repeated, { imported: 0, unchanged: 1, canceled: false, errors: [] });
    assert.deepEqual(store.list(), before);
    assert.deepEqual(stats(), initialStats);
    const reindexStart = performance.now();
    const reindexed = store.reindex(before[0]!.id);
    const reindexMs = performance.now() - reindexStart;
    assert.equal(reindexed.revision, before[0]!.revision + 1);
    assert.equal(reindexed.tokenCount, input.tokens);
    assert.equal(reindexed.contentHash, originalHash);
    assert.deepEqual(stats(), initialStats);

    const engine = new PredictionEngine(store.predictionRepository());
    const predictions: Record<string, { samples: number; medianMs: number; maxMs: number }> = {};
    for (const n of [1, 3] as const) {
      const samples: number[] = [];
      for (let index = 0; index < 5; index++) {
        engine.clearCache();
        const start = performance.now();
        const result = engine.predict({ sourceIds: [reindexed.id], enabledN: [n],
          prefix: n === 1 ? input.prefix : 'wo', context: n === 1 ? [] : input.context });
        samples.push(performance.now() - start);
        assert.equal(result.order, n);
        assert.ok(result.candidates.length > 0 && result.candidates.length <= 3);
        if (n === 3) assert.deepEqual(result.candidates.map((candidate) => candidate.word), [input.next]);
      }
      samples.sort((a, b) => a - b);
      predictions[`N${n}`] = { samples: samples.length, medianMs: rounded(samples[2]!), maxMs: rounded(samples[4]!) };
    }
    assert.deepEqual(store.list(), [reindexed]);
    assert.equal(hash(readFileSync(selected)), originalHash);
    inspection.close();
    store.close();
    console.log(JSON.stringify({ fixture: name, environment: { node: process.version, os: os.platform(), kernel: os.release(),
      arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: rounded(os.totalmem() / 1024 ** 3) },
      limits: importLimits, tokens: input.tokens, utf8Bytes: Buffer.byteLength(input.body), ngrams: initialStats,
      importMs: rounded(importMs), unchangedMs: rounded(unchangedMs), reindexMs: rounded(reindexMs),
      peakRssMiB: rounded(process.resourceUsage().maxRSS / 1024), databaseBytes: statSync(database).size, predictions }));
  } finally {
    if (inspection.open) inspection.close();
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
