// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type Database from 'better-sqlite3';
// Construct the actual pre-TND-007 schema for migration regressions.
export function downgradeToV3(db: Database.Database, enabledN = [1,2,3]): void {
  db.exec(`ALTER TABLE sources DROP COLUMN index_max_n;
    DROP INDEX ngrams_prefix;
    ALTER TABLE ngrams RENAME TO new_ngrams;
    CREATE TABLE ngrams (
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      n INTEGER NOT NULL CHECK(n BETWEEN 1 AND 3), context_key TEXT NOT NULL,
      next_token TEXT NOT NULL COLLATE BINARY, display_token TEXT NOT NULL,
      frequency INTEGER NOT NULL CHECK(frequency > 0), PRIMARY KEY(source_id,n,context_key,next_token)
    ) WITHOUT ROWID;
    INSERT INTO ngrams SELECT * FROM new_ngrams WHERE n <= 3;
    DROP TABLE new_ngrams;
    CREATE INDEX ngrams_prefix ON ngrams(n,next_token COLLATE BINARY,source_id);
    DELETE FROM settings WHERE key IN ('maxN','poolSize','previewWords','acceptWords','ngramScales');
    PRAGMA user_version = 3;`);
  db.prepare("INSERT INTO settings VALUES ('enabledN', ?)").run(JSON.stringify(enabledN));
}
