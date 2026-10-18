// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type Database from 'better-sqlite3';
import { prefixUpperBound } from '../../shared/words';
import type { PredictionCandidate, PredictionRepository, PredictionSnapshot } from './types';

interface SourceState { id: string; revision: number; content_hash: string; enabled: number }

// CROSS JOIN fixes the small selected-source set as the outer loop. Each inner
// lookup uses the N-gram primary key (source, N, context, candidate range).
const rankSql = `SELECT g.next_token AS word, MIN(g.display_token COLLATE BINARY) AS display,
  SUM(g.frequency) AS frequency
  FROM sources AS s CROSS JOIN ngrams AS g
  WHERE s.id IN (SELECT value FROM json_each(@sourceIds)) AND s.enabled = 1
    AND g.source_id = s.id AND g.n = @n AND g.context_key = @context
    AND g.next_token > @prefix AND g.next_token < @upper
  GROUP BY g.next_token COLLATE BINARY
  ORDER BY frequency DESC, g.next_token COLLATE BINARY ASC
  LIMIT 3`;

export class SqlitePredictionRepository implements PredictionRepository {
  private readonly sources: Database.Statement;
  private readonly revision: Database.Statement;
  private readonly rank: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.sources = db.prepare(`SELECT id, revision, content_hash, enabled FROM sources
      WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT 100`);
    this.revision = db.prepare("SELECT value FROM settings WHERE key = 'indexRevision'");
    this.rank = db.prepare(rankSql);
  }

  read<T>(sourceIds: readonly string[], operation: (snapshot: PredictionSnapshot) => T): T {
    return this.db.transaction(() => {
      const revision = this.revision.get() as { value: string } | undefined;
      const indexRevision = Number(revision?.value);
      if (!Number.isSafeInteger(indexRevision) || indexRevision < 0) throw new Error('Invalid index revision.');
      const states = this.sources.all(JSON.stringify(sourceIds)) as SourceState[];
      const activeSourceIds = states.filter((source) => source.enabled === 1).map((source) => source.id);
      return operation({
        indexRevision,
        sourceFingerprint: JSON.stringify(states),
        activeSourceIds,
        select: (n, context, prefix) => this.rank.all({
          sourceIds: JSON.stringify(activeSourceIds), n, context, prefix, upper: prefixUpperBound(prefix),
        }) as PredictionCandidate[],
      });
    })();
  }
}
