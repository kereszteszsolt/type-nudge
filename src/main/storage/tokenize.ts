// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type Database from 'better-sqlite3';
import { importLimits } from '../../shared/sources';
import { SourceError } from './errors';
import { normalizeWord } from '../../shared/words';

export interface NgramCount { n: number; context: string; candidate: string; display: string; frequency: number }
export const indexBatchSize = 4096;

// Streaming token/context traversal: no corpus-sized token array or all-N Map.
export function* ngramBatches(text: string): Generator<{ counts: NgramCount[]; tokenCount: number }> {
  let counts = new Map<string, NgramCount>();
  let tokenCount = 0, context: string[] = [];
  const items = /[.!?。！？;:\r\n\u2028\u2029]|[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
  for (const match of text.normalize('NFC').matchAll(items)) {
    if (/^[.!?。！？;:\r\n\u2028\u2029]$/u.test(match[0])) { context = []; continue; }
    const display = match[0];
    if (display.length > importLimits.wordCodePoints * 2 || [...display].length > importLimits.wordCodePoints) throw new SourceError(`A word exceeds the ${importLimits.wordCodePoints}-character limit.`);
    if (++tokenCount > importLimits.tokens) throw new SourceError(`A file can contain at most ${importLimits.tokens.toLocaleString('en-US')} words.`);
    const candidate = normalizeWord(display);
    for (let n = 1; n <= Math.min(7, context.length + 1); n++) {
      const key = n === 1 ? '' : JSON.stringify(context.slice(-(n - 1)));
      const identity = JSON.stringify([n, key, candidate]);
      const existing = counts.get(identity);
      if (existing) existing.frequency++;
      else counts.set(identity, { n, context: key, candidate, display, frequency: 1 });
      if (counts.size >= indexBatchSize) { yield { counts: [...counts.values()], tokenCount }; counts = new Map(); }
    }
    context.push(candidate);
    if (context.length > 6) context.shift();
    // Also report progress for highly repetitive corpora with very few distinct rows.
    if (tokenCount % 4096 === 0) { yield { counts: [...counts.values()], tokenCount }; counts = new Map(); }
  }
  yield { counts: [...counts.values()], tokenCount };
}

// Caller owns the replacement transaction; rollback retains the previous index.
export function writeNgrams(db: Database.Database, id: string, text: string, progress?: (words: number) => void): number {
  db.prepare('DELETE FROM ngrams WHERE source_id = ?').run(id);
  const insert = db.prepare(`INSERT INTO ngrams VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, n, context_key, next_token) DO UPDATE SET frequency = frequency + excluded.frequency`);
  let tokens = 0;
  for (const batch of ngramBatches(text)) {
    for (const row of batch.counts) insert.run(id, row.n, row.context, row.candidate, row.display, row.frequency);
    tokens = batch.tokenCount;
    progress?.(tokens);
  }
  db.prepare('UPDATE sources SET index_max_n = 7 WHERE id = ?').run(id);
  return tokens;
}
