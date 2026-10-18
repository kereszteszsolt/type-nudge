// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { EditorState } from '@codemirror/state';
import type { PredictionCandidate, PredictionInput } from '../shared/prediction';
import { normalizeWord, partialWord } from '../shared/words';

const token = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
const fragment = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*['’]?$/u;

export function predictionContext(state: EditorState): PredictionInput | null {
  const selection = state.selection;
  if (selection.ranges.length !== 1 || !selection.main.empty) return null;
  const head = selection.main.head;
  // Never offer to insert a completion into the middle of an existing word.
  if (/^[\p{L}\p{M}\p{N}'’]/u.test(state.sliceDoc(head, Math.min(state.doc.length, head + 2)))) return null;
  const line = state.doc.lineAt(head);
  const start = Math.max(line.from, head - 4096);
  let text = state.sliceDoc(start, head);
  if (start > line.from) {
    const separator = text.search(/[^\p{L}\p{M}\p{N}'’]/u);
    if (separator === -1) return null;
    text = text.slice(separator + 1);
  }
  text = text.split(/[.!?。！？;:\u2028\u2029]/u).at(-1)!;
  const prefix = text.match(fragment)?.[0] ?? '';
  if (prefix.length > 256 || [...prefix.normalize('NFC')].length > 128 || (prefix && !partialWord.test(prefix))) return null;
  const context = [...text.slice(0, text.length - prefix.length).matchAll(token)].slice(-6).map((match) => match[0]);
  if (context.some((word) => word.length > 256 || [...word.normalize('NFC')].length > 128)) return null;
  return { prefix, context };
}

export function completionSuffix(candidate: PredictionCandidate, prefix: string): string {
  if (!prefix) return candidate.display;
  const key = normalizeWord(prefix);
  if (!candidate.word.startsWith(key) || candidate.word === key) return '';
  // Preserve the writer's original prefix, including casing and decomposed accents.
  let length = 0;
  for (const point of candidate.display) {
    length += point.length;
    if (normalizeWord(candidate.display.slice(0, length)) === key) return candidate.display.slice(length);
  }
  return candidate.word.slice(key.length);
}
