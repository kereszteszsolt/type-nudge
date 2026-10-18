// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { defaultNgramScales } from '../src/shared/prediction';
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
  if (name === 'repeated-500k') return { body: 'word '.repeat(500_000), tokens: 500_000, sentences: 1,
    prefix: 'wo', context: Array(6).fill('word'), next: 'word' };
  if (name === 'varied-500k' || name === 'unique-500k') {
    const tokens = 500_000;
    const body = Array.from({length:tokens},(_,i)=>'w'+(name==='varied-500k' ? (i*31+i*i)%4096 : i).toString(36)).join(' ');
    return {body,tokens,sentences:1,prefix:'w',context:body.split(' ').slice(0,6),next:body.split(' ')[6]!};
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
      Array.from({length:Math.min(7,input.tokens)},(_,i)=>i+1).map((n) => [n, input.tokens - input.sentences * (n - 1)]));

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
    for (const previewWords of [1, 3, 10]) {
      const samples: number[] = [];
      for (let index = 0; index < 5; index++) {
        engine.clearCache();
        const start = performance.now();
        const result = engine.predict({ngramScales:defaultNgramScales, sourceIds:[reindexed.id],maxN:7,poolSize:10,previewWords,
          prefix:input.prefix,context:input.context });
        samples.push(performance.now()-start);
        assert.ok(result.words.length>0 && result.words.length<=previewWords);
        assert.ok(result.candidates.length>0 && result.candidates.length<=10);
      }
      samples.sort((a,b)=>a-b);
      predictions[`N1-7_preview${previewWords}`]={samples:samples.length,medianMs:rounded(samples[2]!),maxMs:rounded(samples[4]!)};
    }
    const walBytes = (()=>{try{return statSync(database+'-wal').size;}catch{return 0;}})();
    assert.deepEqual(store.list(), [reindexed]);
    assert.equal(hash(readFileSync(selected)), originalHash);
    inspection.close();
    store.close();
    console.log(JSON.stringify({ fixture: name, environment: { node: process.version, os: os.platform(), kernel: os.release(),
      arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: rounded(os.totalmem() / 1024 ** 3) },
      limits: importLimits, tokens: input.tokens, utf8Bytes: Buffer.byteLength(input.body), ngrams: initialStats,
      importMs: rounded(importMs), unchangedMs: rounded(unchangedMs), reindexMs: rounded(reindexMs),
      peakRssMiB: rounded(process.resourceUsage().maxRSS / 1024), databaseBytes: statSync(database).size, walBytes, predictions }));
  } finally {
    if (inspection.open) inspection.close();
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
