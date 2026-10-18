// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

// Keep indexing, prediction and inline suffix comparison identical.
export function normalizeWord(word: string): string {
  return word.normalize('NFC').toLowerCase().replaceAll('’', "'").normalize('NFC');
}

export const completeWord = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
export const partialWord = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*['’]?$/u;

// For validated word prefixes, increment the final Unicode scalar, not a UTF-16
// code unit. SQLite's BINARY text ranges then also work for supplementary letters.
export function prefixUpperBound(prefix: string): string {
  if (!prefix) return '\u{10ffff}';
  const points = [...prefix];
  const last = points.pop()!.codePointAt(0)!;
  const next = last + 1 === 0xd800 ? 0xe000 : last + 1;
  return points.join('') + String.fromCodePoint(next);
}
