// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { PredictionEngine } from '../../src/main/prediction/engine';
import { LruCache } from '../../src/main/prediction/lru';
import { normalizePredictionRequest } from '../../src/main/prediction/request';
import { normalizeWord, prefixUpperBound } from '../../src/main/text/words';
import type { NgramOrder, PredictionRepository, PredictionRequest, PredictionSnapshot } from '../../src/main/prediction/types';

const a = '11111111-1111-4111-8111-111111111111';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const candidate = { word: 'calmly', display: 'Calmly', frequency: 3 };
const request: PredictionRequest = { prefix: '', context: ['we', 'write'], sourceIds: [a], enabledN: [1, 2, 3] };

function fixture(capacity = 128) {
  const select = vi.fn<PredictionSnapshot['select']>().mockReturnValue([candidate]);
  const snapshot = { indexRevision: 1, sourceFingerprint: 'source-a:1:enabled', activeSourceIds: [a], select };
  const read = vi.fn();
  const repository: PredictionRepository = { read(ids, operation) { read(ids); return operation(snapshot); } };
  const engine = new PredictionEngine(repository, capacity);
  return { engine, read, select, snapshot };
}

describe('enabled-order prediction backoff', () => {
  it.each<[NgramOrder[], NgramOrder]>([
    [[1], 1], [[2], 2], [[3], 3], [[1, 2], 2], [[1, 3], 3], [[2, 3], 3], [[1, 2, 3], 3],
  ])('uses only the longest matching order in %j', (enabledN, order) => {
    const { engine, select } = fixture();
    expect(engine.predict({ ...request, enabledN })).toMatchObject({ order, candidates: [candidate] });
    expect(select.mock.calls.map((call) => call[0])).toEqual([order]);
    expect(select.mock.calls[0]?.[1]).toBe(order === 1 ? '' : order === 2 ? '["write"]' : '["we","write"]');
  });

  it('backs off only after an empty match and never fills remaining slots from lower orders', () => {
    const { engine, select } = fixture();
    select.mockImplementation((n) => n === 3 ? [] : [candidate]);
    expect(engine.predict(request).order).toBe(2);
    expect(select.mock.calls.map((call) => call[0])).toEqual([3, 2]);
    expect(engine.predict(request).candidates).toHaveLength(1);
  });

  it('skips disabled N=2 even when it could return a match', () => {
    const { engine, select } = fixture();
    select.mockImplementation((n) => n === 3 ? [] : [candidate]);
    expect(engine.predict({ ...request, enabledN: [1, 3] }).order).toBe(1);
    expect(select.mock.calls.map((call) => call[0])).toEqual([3, 1]);
  });

  it('does not query contextually unusable orders', () => {
    const { engine, select } = fixture();
    expect(engine.predict({ ...request, context: [], enabledN: [2, 3] })).toMatchObject({ order: null, candidates: [] });
    expect(select).not.toHaveBeenCalled();
    expect(engine.predict({ ...request, context: ['write'] }).order).toBe(2);
    expect(select.mock.calls.map((call) => call[0])).toEqual([2]);
  });

  it('returns no candidate after exhausting only the enabled orders', () => {
    const { engine, select } = fixture();
    select.mockReturnValue([]);
    expect(engine.predict(request)).toEqual({ order: null, candidates: [], indexRevision: 1 });
    expect(select.mock.calls.map((call) => call[0])).toEqual([3, 2, 1]);
  });

  it('returns no candidate without querying N-grams when no selected source is active', () => {
    const { engine, select, snapshot } = fixture();
    snapshot.activeSourceIds = [];
    expect(engine.predict(request).candidates).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});

describe('bounded prediction requests and shared normalization', () => {
  it('normalizes NFC/case/apostrophes, deduplicates and orders source/settings sets', () => {
    expect(normalizePredictionRequest({ prefix: 'A\u0301R', context: ['DON’T', 'ȘTIINȚĂ'], sourceIds: [b.toUpperCase(), a, a], enabledN: [3, 1, 3] }))
      .toEqual({ prefix: 'ár', context: ["don't", 'știință'], sourceIds: [a, b], enabledN: [3, 1] });
    expect(normalizeWord('İZMİR')).toBe('i\u0307zmi\u0307r');
  });

  it('accepts the empty prefix, complete words, and a partial trailing apostrophe', () => {
    for (const prefix of ['', 'word', "don'", 'don’', '日本語', '𐐀']) {
      expect(normalizePredictionRequest({ ...request, prefix }).prefix).toBe(normalizeWord(prefix));
    }
  });

  it.each([
    null, [], {}, { ...request, path: '/etc/passwd' },
    { ...request, enabledN: [] }, { ...request, enabledN: [0] }, { ...request, enabledN: [4] },
    { ...request, enabledN: [1, '2'] }, { ...request, enabledN: [1, 2, 3, 3] },
    { ...request, prefix: 'a'.repeat(129) }, { ...request, prefix: '%wildcard' }, { ...request, prefix: '_word' },
    { ...request, prefix: "'; SELECT 1; --" }, { ...request, prefix: 'two words' }, { ...request, prefix: '\ud800' },
    { ...request, context: ['one', 'two', 'three'] }, { ...request, context: ['hello.', 'world'] },
    { ...request, context: ["don'"] }, { ...request, context: [''] },
    { ...request, sourceIds: ['not-an-id'] }, { ...request, sourceIds: Array(101).fill(a) },
  ])('rejects invalid input before touching storage: %j', (input) => {
    const { engine, read } = fixture();
    expect(() => engine.predict(input as PredictionRequest)).toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it('computes binary prefix bounds using Unicode code points', () => {
    expect(prefixUpperBound('ár')).toBe('ás');
    expect(prefixUpperBound("don'")).toBe('don(');
    expect(prefixUpperBound('𐐨')).toBe('𐐩');
    expect(prefixUpperBound('')).toBe('\u{10ffff}');
  });
});

describe('revision/source/settings aware prediction cache', () => {
  it('reuses equivalent normalized requests, with a fresh source snapshot on every call', () => {
    const { engine, read, select } = fixture();
    const first = engine.predict({ ...request, prefix: 'ÁR', sourceIds: [b, a], enabledN: [1, 3] });
    const second = engine.predict({ ...request, prefix: 'A\u0301r', sourceIds: [a, b, a], enabledN: [3, 1] });
    expect(second).toBe(first);
    expect(read).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('separates prefix, context, requested sources and enabled orders in cache keys', () => {
    const { engine, select } = fixture();
    for (const input of [request, { ...request, prefix: 'c' }, { ...request, context: ['they', 'write'] },
      { ...request, sourceIds: [b] }, { ...request, enabledN: [1] as const }]) engine.predict(input);
    expect(select).toHaveBeenCalledTimes(5);
  });

  it('invalidates after an index revision and distinguishes changed source activation/revisions', () => {
    const { engine, select, snapshot } = fixture();
    engine.predict(request);
    snapshot.indexRevision++;
    engine.predict(request);
    snapshot.sourceFingerprint = 'source-a:2:disabled';
    snapshot.activeSourceIds = [];
    expect(engine.predict(request).candidates).toEqual([]);
    snapshot.sourceFingerprint = 'source-a:2:enabled';
    snapshot.activeSourceIds = [a];
    engine.predict(request);
    expect(select).toHaveBeenCalledTimes(3);
  });

  it('evicts least recently used requests and supports an explicit clear', () => {
    const { engine, select } = fixture(2);
    const withPrefix = (prefix: string) => ({ ...request, prefix });
    engine.predict(withPrefix('a'));
    engine.predict(withPrefix('b'));
    engine.predict(withPrefix('a'));
    engine.predict(withPrefix('c'));
    engine.predict(withPrefix('b'));
    expect(select).toHaveBeenCalledTimes(4);
    engine.clearCache();
    engine.predict(withPrefix('b'));
    expect(select).toHaveBeenCalledTimes(5);
  });

  it('caches empty results and protects cached values from caller/adapter mutation', () => {
    const { engine, select } = fixture();
    const row = { ...candidate };
    select.mockReturnValue([row]);
    const result = engine.predict(request);
    row.frequency = 999;
    expect(() => (result.candidates as unknown[]).push(row)).toThrow();
    expect(engine.predict(request).candidates[0]?.frequency).toBe(3);
    select.mockReturnValue([]);
    engine.clearCache();
    engine.predict(request);
    engine.predict(request);
    expect(select).toHaveBeenCalledTimes(4); // one match, then N=3/2/1 once
  });

  it('does not cache a failed query', () => {
    const { engine, select } = fixture();
    select.mockImplementationOnce(() => { throw new Error('fixture failure'); });
    expect(() => engine.predict(request)).toThrow('fixture failure');
    expect(engine.predict(request).candidates).toEqual([candidate]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});

describe('small LRU', () => {
  it.each([0, -1, 257, 1.5, NaN])('rejects unbounded/invalid capacity %s', (capacity) => {
    expect(() => new LruCache(capacity)).toThrow('capacity');
  });

  it('updates values, stays bounded and clears completely', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1); cache.set('b', 2); cache.set('a', 3); cache.set('c', 4);
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(3);
    expect(cache.get('b')).toBeUndefined();
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
