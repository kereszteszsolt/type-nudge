// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { LruCache } from './lru';
import { normalizePredictionRequest } from './request';
import type { NgramOrder, PredictionCandidate, PredictionRepository, PredictionRequest, PredictionResult, PredictionSnapshot } from './types';

function rank(a: PredictionCandidate, b: PredictionCandidate): number {
  return b.frequency - a.frequency || Buffer.compare(Buffer.from(a.word), Buffer.from(b.word));
}
export function weightedChoice(pool: readonly PredictionCandidate[], random: () => number): PredictionCandidate | undefined {
  if (!pool.length) return undefined;
  const r = random();
  if (!Number.isFinite(r) || r < 0 || r >= 1) throw new Error('Random value must be in [0,1).');
  let remaining = r * pool.reduce((sum, row) => sum + row.frequency, 0);
  for (const row of pool) { remaining -= row.frequency; if (remaining < 0) return row; }
  return pool.at(-1); // Floating-point roundoff only.
}
export class PredictionEngine {
  private readonly cache: LruCache<readonly PredictionCandidate[]>;
  private revision: number | undefined;
  constructor(private readonly repository: PredictionRepository, cacheCapacity = 128, private readonly random = Math.random) {
    this.cache = new LruCache(cacheCapacity);
  }
  clearCache(): void { this.cache.clear(); }
  private pool(request: PredictionRequest, snapshot: PredictionSnapshot): readonly PredictionCandidate[] {
    const key = JSON.stringify(['merged', request.prefix, request.context, request.sourceIds, request.maxN, request.poolSize,
      request.ngramScales, snapshot.indexRevision, snapshot.sourceFingerprint]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const merged = new Map<string, PredictionCandidate>();
    if (snapshot.activeSourceIds.length) for (let n = 1; n <= Math.min(request.maxN, request.context.length + 1); n++) {
      const scale = request.ngramScales[n - 1]!;
      // Zero-weight orders contribute no candidates; an all-zero mixture stays empty.
      if (scale === 0) continue;
      const context = n === 1 ? '' : JSON.stringify(request.context.slice(-(n - 1)));
      // The unigram context (and often a shorter suffix) is unchanged across lookahead positions.
      // SQL pools and merged pools share the SAME bounded LRU; no corpus-sized cache.
      const orderKey = JSON.stringify(['order', n, context, request.prefix, request.sourceIds, request.maxN, request.poolSize,
        snapshot.indexRevision, snapshot.sourceFingerprint]);
      let rows = this.cache.get(orderKey);
      if (!rows) {
        rows = Object.freeze(snapshot.select(n as NgramOrder, context, request.prefix, request.poolSize)
          .map((row) => Object.freeze({ ...row })));
        this.cache.set(orderKey, rows);
      }
      for (const row of rows) {
        const old = merged.get(row.word);
        const display = old && Buffer.compare(Buffer.from(old.display), Buffer.from(row.display)) < 0 ? old.display : row.display;
        merged.set(row.word, { word: row.word, display, frequency: (old?.frequency ?? 0) + row.frequency * scale });
      }
    }
    const result = Object.freeze([...merged.values()].sort(rank).slice(0, request.poolSize).map((row) => Object.freeze(row)));
    this.cache.set(key, result);
    return result;
  }
  predict(input: PredictionRequest): PredictionResult {
    const request = normalizePredictionRequest(input);
    return this.repository.read(request.sourceIds, (snapshot) => {
      if (this.revision !== snapshot.indexRevision) { this.cache.clear(); this.revision = snapshot.indexRevision; }
      const words: PredictionCandidate[] = [];
      let next = request;
      let candidates: readonly PredictionCandidate[] = [];
      for (let i = 0; i < request.previewWords; i++) {
        const pool = this.pool(next, snapshot);
        if (i === 0) candidates = pool;
        const alternatives = i === 0 && request.avoidWord && pool.length > 1 ? pool.filter((row) => row.word !== request.avoidWord) : pool;
        const word = weightedChoice(alternatives, this.random);
        if (!word) break;
        words.push(word);
        next = { ...next, prefix: '', context: [...next.context, word.word].slice(-6) };
      }
      return Object.freeze({ candidates, words: Object.freeze(words), indexRevision: snapshot.indexRevision });
    });
  }
}
