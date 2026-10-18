// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { PredictionEngine, weightedChoice } from '../../src/main/prediction/engine';
import { LruCache } from '../../src/main/prediction/lru';
import { normalizePredictionRequest } from '../../src/main/prediction/request';
import { defaultNgramScales, defaultPredictionSettings, validatePredictionSettings } from '../../src/shared/prediction';
import { normalizeWord, prefixUpperBound } from '../../src/shared/words';
import type { PredictionRepository, PredictionRequest, PredictionSnapshot } from '../../src/main/prediction/types';

const a = '11111111-1111-4111-8111-111111111111', b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const row = (word: string, frequency: number) => ({ word, display: word, frequency });
const request: PredictionRequest = { ngramScales: defaultNgramScales, prefix: '', context: ['a', 'b'], sourceIds: [a], maxN: 3, poolSize: 2, previewWords: 1 };
function fixture(capacity = 128, random = () => 0) {
  const select = vi.fn<PredictionSnapshot['select']>().mockReturnValue([row('alma', 1)]);
  const snapshot = { indexRevision: 1, sourceFingerprint: 'source-a:1:enabled', activeSourceIds: [a], select };
  const read = vi.fn();
  const repository: PredictionRepository = { read(ids, operation) { read(ids); return operation(snapshot); } };
  return { engine: new PredictionEngine(repository, capacity, random), select, snapshot, read };
}
it('mixes every usable order and truncates again after merging admitted counts', () => {
  const { engine, select } = fixture();
  select.mockImplementation((n) => n === 1 ? [row('alma',11),row('körte',10)] : n === 2 ? [row('szilva',7),row('alma',6)] : [row('szilva',5),row('alma',1)]);
  const result = engine.predict(request);
  expect(result.candidates).toEqual([row('alma',18),row('szilva',12)]);
  expect(result.words).toEqual([row('alma',18)]);
  expect(select.mock.calls).toEqual([[1,'','',2],[2,'["b"]','',2],[3,'["a","b"]','',2]]);
  expect(Object.keys(result.candidates[0]!)).toEqual(['word','display','frequency']);
});
it('scales admitted counts before the final cutoff, reuses raw SQL pools and resamples by scaled score', () => {
  let random = 0;
  const { engine, select } = fixture(128, () => random);
  select.mockImplementation((n) => n === 1 ? [row('alma',11),row('körte',10)] : n === 2 ? [row('szilva',7),row('alma',6)] : [row('szilva',5),row('alma',1)]);
  expect(engine.predict(request).candidates).toEqual([row('alma',18),row('szilva',12)]);
  const scaled = { ...request, ngramScales: [1,1,100,1,1,1,1] as const };
  expect(engine.predict(scaled).candidates).toEqual([row('szilva',507),row('alma',117)]);
  random = 507 / 624 - .000001;
  expect(engine.predict(scaled).words[0]?.word).toBe('szilva');
  random = 507 / 624 + .000001;
  expect(engine.predict(scaled).words[0]?.word).toBe('alma');
  expect(engine.predict(request).candidates).toEqual([row('alma',18),row('szilva',12)]);
  expect(select).toHaveBeenCalledTimes(3);
});
it('omits zero-weight orders from cached mixtures while retaining positive-order evidence', () => {
  const { engine, select } = fixture();
  select.mockImplementation((n) => [row(n === 1 ? 'unigram' : n === 2 ? 'bigram' : 'trigram', n === 1 ? 1000 : 1)]);
  expect(engine.predict(request).candidates[0]?.word).toBe('unigram');
  const input = { ...request, ngramScales: [0,250,0,1,1,1,1] as const };
  expect(engine.predict(input).candidates).toEqual([row('bigram',250)]);
  expect(select).toHaveBeenCalledTimes(3);
  expect(engine.predict(request).candidates[0]?.word).toBe('unigram');
  expect(select).toHaveBeenCalledTimes(3);
});
it('returns no suggestion or random draw for all-zero usable weights, including warm caches', () => {
  const random = vi.fn(() => 0);
  const { engine, select } = fixture(128, random);
  engine.predict(request); random.mockClear();
  const input = { ...request, previewWords: 10, ngramScales: [0,0,0,0,0,0,0] as const };
  expect(engine.predict(input)).toEqual({ candidates: [], words: [], indexRevision: 1 });
  expect(select).toHaveBeenCalledTimes(3);
  engine.clearCache(); select.mockClear();
  expect(engine.predict(input).words).toEqual([]);
  expect(select).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled();
  expect(engine.predict({ ...input, ngramScales: [0,0,0,0,0,0,250] }).words).toEqual([]);
});
it.each([1,2,3,4,5,6,7] as const)('includes exactly all usable lower orders through N=%i', (maxN) => {
  const { engine, select } = fixture();
  engine.predict({ ...request, maxN, context: ['a','b','c','d','e','f'] });
  expect(select.mock.calls.map((call) => call[0])).toEqual(Array.from({length:maxN},(_,i)=>i+1));
  if (maxN === 7) expect(select.mock.calls.at(-1)?.[1]).toBe('["a","b","c","d","e","f"]');
});
it('skips unusable/empty orders without suppressing any other evidence', () => {
  const { engine, select } = fixture();
  select.mockImplementation((n) => n === 2 ? [] : [row('alma',1)]);
  expect(engine.predict({ ...request, maxN:7, context:['a'] }).candidates).toEqual([row('alma',1)]);
  expect(select.mock.calls.map((call)=>call[0])).toEqual([1,2]);
});
it('does not query any order without eligible sources and stops an empty preview', () => {
  const { engine, select, snapshot } = fixture(); snapshot.activeSourceIds=[];
  expect(engine.predict(request)).toEqual({candidates:[],words:[],indexRevision:1}); expect(select).not.toHaveBeenCalled();
  snapshot.activeSourceIds=[a]; snapshot.sourceFingerprint='enabled'; select.mockReturnValue([]);
  expect(engine.predict({...request,previewWords:10}).words).toEqual([]); expect(select).toHaveBeenCalledTimes(3);
});
it.each([[0,'alma'],[0.599999,'alma'],[0.6,'szilva'],[0.999999,'szilva']] as const)('samples exact final-score boundary %s', (random, expected) => {
  expect(weightedChoice([row('alma',18),row('szilva',12)],()=>random)?.word).toBe(expected);
});
it('handles singleton/empty pools and rejects broken RNGs', () => {
  expect(weightedChoice([],()=>0)).toBeUndefined(); expect(weightedChoice([row('one',2)],()=>.9)?.word).toBe('one');
  for (const r of [-1,1,NaN,Infinity]) expect(()=>weightedChoice([row('one',2)],()=>r)).toThrow();
});
it('extends the virtual context per position, using a prefix only once and one read snapshot', () => {
  const { engine, select, read } = fixture();
  select.mockImplementation((_n,_context,prefix) => [row(prefix ? 'alma' : 'barack',1)]);
  const result = engine.predict({...request,prefix:'al',maxN:7,previewWords:3});
  expect(result.words.map((r)=>r.word)).toEqual(['alma','barack','barack']);
  expect(read).toHaveBeenCalledTimes(1);
  expect(select.mock.calls).toContainEqual([4,'["a","b","alma"]','',2]);
  expect(select.mock.calls).toContainEqual([5,'["a","b","alma","barack"]','',2]);
});
it('caches deterministic pools while resampling continuations and avoiding a previous first word on demand', () => {
  let random=0; const {engine,select}=fixture(128,()=>random);
  select.mockReturnValue([row('alma',2),row('szilva',1)]);
  expect(engine.predict(request).words[0]?.word).toBe('alma'); random=.99;
  expect(engine.predict(request).words[0]?.word).toBe('szilva'); expect(select).toHaveBeenCalledTimes(3);
  random=0; expect(engine.predict({...request,avoidWord:'alma'}).words[0]?.word).toBe('szilva');
  select.mockReturnValue([row('alma',1)]); engine.clearCache();
  expect(engine.predict({...request,avoidWord:'alma'}).words[0]?.word).toBe('alma');
});
it('reuses invariant per-N pools across multi-word rollout inside the same bounded cache',()=>{
  const {engine,select}=fixture();select.mockReturnValue([row('alma',1)]);
  engine.predict({...request,prefix:'al',maxN:7,previewWords:10});
  expect(select.mock.calls.filter(c=>c[0]===1&&c[2]==='')).toHaveLength(1);
  expect(select.mock.calls.filter(c=>c[0]===1&&c[2]==='al')).toHaveLength(1);
});
it('uses BINARY word ties including supplementary Unicode, and deterministic display spelling', () => {
  const {engine,select}=fixture();
  select.mockImplementation((n)=>n===1?[{...row('alma',1),display:'Alma'},row('𐐨',2)]:n===2?[row('alma',1),row('z',2)]:[]);
  expect(engine.predict(request).candidates).toEqual([{...row('alma',2),display:'Alma'},row('z',2)]);
});
it('invalidates deterministic pools for revisions, activation, source IDs, context, prefix, N and X', () => {
  const {engine,select,snapshot}=fixture(); engine.predict(request); engine.predict(request); expect(select).toHaveBeenCalledTimes(3);
  for (const change of [{poolSize:1},{maxN:1 as const},{prefix:'a'},{context:['b']},{sourceIds:[b]}]) engine.predict({...request,...change});
  expect(select).toHaveBeenCalledTimes(13);
  snapshot.indexRevision++; engine.predict(request); expect(select).toHaveBeenCalledTimes(16);
  snapshot.sourceFingerprint='disabled'; snapshot.activeSourceIds=[]; expect(engine.predict(request).candidates).toEqual([]);
});
it('bounds LRU eviction and freezes rows without caching failures', () => {
  const {engine,select}=fixture(2);
  for(const prefix of ['a','b','a','c','b']) engine.predict({...request,prefix,maxN:1});
  expect(select).toHaveBeenCalledTimes(5);
  expect(()=> (engine.predict(request).candidates as unknown[]).push({})).toThrow();
  engine.clearCache(); select.mockImplementationOnce(()=>{throw new Error('failure');});
  expect(()=>engine.predict(request)).toThrow('failure'); expect(engine.predict(request).candidates).toHaveLength(1);
});
it('normalizes bounded NFC/case/apostrophe requests and deduplicates IDs', () => {
  expect(normalizePredictionRequest({...request,prefix:'A\u0301R',context:['DON’T','ȘTIINȚĂ'],sourceIds:[b.toUpperCase(),a,a]}))
    .toEqual({...request,prefix:'ár',context:["don't",'știință'],sourceIds:[a,b]});
  expect(normalizeWord('İZMİR')).toBe('i\u0307zmi\u0307r');
  for(const prefix of ['',"don'",'日本語','𐐀']) expect(normalizePredictionRequest({...request,prefix}).prefix).toBe(normalizeWord(prefix));
});
it.each([null,[],{}, {...request,sql:'drop'}, {...request,maxN:0},{...request,maxN:8},{...request,maxN:1.5},
  {...request,poolSize:0},{...request,poolSize:101},{...request,previewWords:11},{...request,previewWords:'3'},
  {...request,context:Array(7).fill('word')},{...request,context:['two words']},{...request,context:["don'"]},
  {...request,prefix:'a'.repeat(129)},{...request,prefix:'%wild'},{...request,prefix:'\ud800'},
  {...request,sourceIds:['invalid']},{...request,sourceIds:Array(101).fill(a)},{...request,avoidWord:'two words'}
])('rejects invalid requests before storage %j', (input) => {
  const {engine,read}=fixture(); expect(()=>engine.predict(input as PredictionRequest)).toThrow(); expect(read).not.toHaveBeenCalled();
});
it('validates all settings atomically with mandatory lower orders implicit in maxN', () => {
  expect(validatePredictionSettings({...defaultPredictionSettings,maxN:7})).toMatchObject({maxN:7});
  for(const extra of [{maxN:0},{maxN:7.5},{poolSize:101},{previewWords:0},{acceptWords:4},{sourceMode:'cloud'},{enabledN:[1,3]}])
    expect(()=>validatePredictionSettings({...defaultPredictionSettings,...extra})).toThrow();
});
it.each([undefined, null, [], [1,1,1,1,1,1], [1,1,1,1,1,1,1,1], [-1,1,1,1,1,1,1],
  [251,1,1,1,1,1,1], [1.5,1,1,1,1,1,1], ['2',1,1,1,1,1,1], [NaN,1,1,1,1,1,1],
  [Infinity,1,1,1,1,1,1], Array(7)])('rejects invalid multipliers in settings and requests %j', (ngramScales) => {
  expect(() => validatePredictionSettings({ ...defaultPredictionSettings, ngramScales })).toThrow();
  const { engine, read } = fixture();
  expect(() => engine.predict({ ...request, ngramScales } as unknown as PredictionRequest)).toThrow();
  expect(read).not.toHaveBeenCalled();
});
it('copies and freezes validated scales, accepting every integer boundary without mutating defaults', () => {
  const values = [0,250,50,25,2,3,4];
  const result = validatePredictionSettings({ ...defaultPredictionSettings, ngramScales: values });
  values[0] = 100;
  expect(result.ngramScales).toEqual([0,250,50,25,2,3,4]);
  expect(Object.isFrozen(result.ngramScales)).toBe(true);
  expect(defaultPredictionSettings.ngramScales).toEqual([1,1,1,1,1,1,1]);
});
it('computes Unicode binary prefix bounds',()=>{
  expect(prefixUpperBound('ár')).toBe('ás'); expect(prefixUpperBound('𐐨')).toBe('𐐩'); expect(prefixUpperBound('')).toBe('\u{10ffff}');
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
