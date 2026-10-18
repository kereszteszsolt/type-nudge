// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { importLimits } from '../../shared/sources';
import { SourceError } from './errors';
import { normalizeWord } from '../../shared/words';

export interface NgramCount {
  n: number;
  context: string;
  candidate: string;
  display: string;
  frequency: number;
}

export function countNgrams(text: string): { counts: NgramCount[]; tokenCount: number } {
  const counts = new Map<string, NgramCount>();
  let tokenCount = 0;
  for (const sentence of text.normalize('NFC').split(/[.!?。！？;:\r\n]+/u)) {
    const context: string[] = [];
    for (const match of sentence.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu)) {
      const display = match[0];
      if (display.length > importLimits.wordCodePoints * 2 || [...display].length > importLimits.wordCodePoints) {
        throw new SourceError(`A word exceeds the ${importLimits.wordCodePoints}-character limit.`);
      }
      if (++tokenCount > importLimits.tokens) throw new SourceError(`A file can contain at most ${importLimits.tokens.toLocaleString('en-US')} words.`);
      const candidate = normalizeWord(display);
      for (let n = 1; n <= Math.min(3, context.length + 1); n++) {
        const key = n === 1 ? '' : JSON.stringify(context.slice(-(n - 1)));
        const identity = JSON.stringify([n, key, candidate]);
        const existing = counts.get(identity);
        if (existing) existing.frequency++;
        else counts.set(identity, { n, context: key, candidate, display, frequency: 1 });
      }
      context.push(candidate);
      if (context.length > 2) context.shift();
    }
  }
  return { counts: [...counts.values()], tokenCount };
}
