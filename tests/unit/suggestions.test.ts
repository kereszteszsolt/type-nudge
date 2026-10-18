// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, it, vi } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { completionSuffix, predictionContext } from '../../src/renderer/prediction-context';
import { LatestRequest } from '../../src/renderer/latest-request';

function context(doc: string, head = doc.length) { return predictionContext(EditorState.create({ doc, selection: { anchor: head } })); }
it.each([
  ['', { prefix: '', context: [] }], ['we write wo', { prefix: 'wo', context: ['we', 'write'] }],
  ['earlier. New wo', { prefix: 'wo', context: ['New'] }], ['earlier\nÚj ár', { prefix: 'ár', context: ['Új'] }],
  ['earlier\u2028New wo', {prefix:'wo',context:['New']}], ['earlier\u2029New wo', {prefix:'wo',context:['New']}],
  ['one; two: three! four? five。 șt', { prefix: 'șt', context: [] }],
  ["one, two-three don’", { prefix: 'don’', context: ['one', 'two', 'three'] }],
  ['a b c ', { prefix: '', context: ['a', 'b', 'c'] }], ['A\u0301rvíz 日本語 ', { prefix: '', context: ['A\u0301rvíz', '日本語'] }],
])('extracts bounded current-sentence CodeMirror context from %j', (text, expected) => { expect(context(text)).toEqual(expected); });
it('suppresses selections, multiple carets, midword completions and overlong tokens', () => {
  expect(predictionContext(EditorState.create({ doc: 'word', selection: { anchor: 0, head: 2 } }))).toBeNull();
  expect(predictionContext(EditorState.create({ doc: 'a b', extensions: EditorState.allowMultipleSelections.of(true),
    selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(2)]) }))).toBeNull();
  expect(context('words', 2)).toBeNull();
  expect(context('a'.repeat(129))).toBeNull();
  expect(context('a'.repeat(129) + ' b')).toBeNull();
  expect(context('a'.repeat(5000))).toBeNull();
  expect(context('x'.repeat(5000) + ' we write wo')).toEqual({ prefix: 'wo', context: ['we', 'write'] });
});
it.each([
  ['words', 'Words', 'wo', 'rds'], ['árvíz', 'Árvíz', 'A\u0301r', 'víz'], ["don't", "Don’t", "don'", 't'],
  ['i\u0307z', 'İz', 'i', '\u0307z'], ['words', 'Words', '', 'Words'], ['word', 'Word', 'word', ''],
])('inserts only the missing suffix for %s / %s / %s', (word, display, prefix, expected) => {
  expect(completionSuffix({ word, display, frequency: 1 }, prefix)).toBe(expected);
});
afterEach(() => { vi.useRealTimers(); });
it('debounces typing and ignores out-of-order responses even after returning to the same context', async () => {
  vi.useFakeTimers();
  const latest = new LatestRequest();
  const accepts = vi.fn();
  let resolve!: (value: string) => void;
  const old = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
  latest.schedule(old, accepts, vi.fn());
  latest.schedule(old, accepts, vi.fn());
  await vi.advanceTimersByTimeAsync(60);
  expect(old).toHaveBeenCalledTimes(1);
  latest.cancel();
  latest.schedule(async () => 'new', accepts, vi.fn());
  await vi.advanceTimersByTimeAsync(60);
  resolve('old');
  await vi.runAllTimersAsync();
  expect(accepts.mock.calls).toEqual([['new']]);
});
it('drops cancelled failures, pending debounce and responses after editor destruction', async () => {
  vi.useFakeTimers();
  const latest = new LatestRequest();
  const accept = vi.fn(), fail = vi.fn(), never = vi.fn();
  let reject!: (error: Error) => void;
  latest.schedule(() => new Promise<string>((_resolve, error) => { reject = error; }), accept, fail);
  await vi.advanceTimersByTimeAsync(60);
  latest.cancel();
  reject(new Error('stale'));
  latest.schedule(never, accept, fail);
  latest.destroy();
  latest.schedule(never, accept, fail);
  await vi.runAllTimersAsync();
  expect(never).not.toHaveBeenCalled(); expect(accept).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
});
