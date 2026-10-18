// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { LruCache } from './lru';
import { normalizePredictionRequest } from './request';
import type { NgramOrder, PredictionRepository, PredictionRequest, PredictionResult } from './types';

export class PredictionEngine {
  private readonly cache: LruCache<PredictionResult>;
  private revision: number | undefined;

  constructor(private readonly repository: PredictionRepository, cacheCapacity = 128) {
    this.cache = new LruCache(cacheCapacity);
  }

  clearCache(): void { this.cache.clear(); }

  predict(input: PredictionRequest): PredictionResult {
    const request = normalizePredictionRequest(input);
    return this.repository.read(request.sourceIds, (snapshot) => {
      if (this.revision !== snapshot.indexRevision) {
        this.cache.clear();
        this.revision = snapshot.indexRevision;
      }
      const key = JSON.stringify([request.prefix, request.context, request.sourceIds, request.enabledN,
        snapshot.indexRevision, snapshot.sourceFingerprint]);
      const cached = this.cache.get(key);
      if (cached) return cached;

      let order: NgramOrder | null = null;
      let candidates: PredictionResult['candidates'] = [];
      if (snapshot.activeSourceIds.length) {
        for (const n of request.enabledN) {
          if (request.context.length < n - 1) continue;
          const context = n === 1 ? '' : JSON.stringify(request.context.slice(-(n - 1)));
          const rows = snapshot.select(n, context, request.prefix);
          if (rows.length) {
            order = n;
            candidates = rows;
            break;
          }
        }
      }
      const result = Object.freeze({
        candidates: Object.freeze(candidates.map((candidate) => Object.freeze({ ...candidate }))),
        order,
        indexRevision: snapshot.indexRevision,
      });
      this.cache.set(key, result);
      return result;
    });
  }
}
