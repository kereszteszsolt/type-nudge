// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { importLimits, type SourceSummary } from '../../shared/sources';
import { SourceError } from './errors';
import { countNgrams } from './tokenize';
import { SqlitePredictionRepository } from '../prediction/sqlite-repository';
import type { PredictionRepository } from '../prediction/types';
import { validatePredictionSettings, type PredictionSettings, type SourceMode } from '../../shared/prediction';
import { PersonalStore } from './personal';

interface SourceRow {
  id: string; name: string; enabled: number; revision: number;
  contentHash: string; tokenCount: number; updatedAt: string;
}

const summaryColumns = `id, display_name AS name, enabled, revision,
  content_hash AS contentHash, token_count AS tokenCount, updated_at AS updatedAt`;

export class SourceStore {
  private readonly db: Database.Database;
  readonly personal: PersonalStore;

  constructor(filename: string) {
    this.db = new Database(filename);
    try {
      const version = this.db.pragma('user_version', { simple: true }) as number;
      if (version > 2) throw new SourceError('This database needs a newer version of TypeNudge.');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
      if (version === 0) this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE sources (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK(kind IN ('imported', 'personal')),
            origin_key TEXT UNIQUE,
            display_name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
            revision INTEGER NOT NULL CHECK(revision > 0),
            content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
            token_count INTEGER NOT NULL CHECK(token_count >= 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE CASCADE,
            body_text TEXT NOT NULL,
            byte_length INTEGER NOT NULL CHECK(byte_length >= 0)
          );
          CREATE TABLE ngrams (
            source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            n INTEGER NOT NULL CHECK(n BETWEEN 1 AND 3),
            context_key TEXT NOT NULL,
            next_token TEXT NOT NULL COLLATE BINARY,
            display_token TEXT NOT NULL,
            frequency INTEGER NOT NULL CHECK(frequency > 0),
            PRIMARY KEY(source_id, n, context_key, next_token)
          ) WITHOUT ROWID;
          CREATE INDEX ngrams_prefix ON ngrams(n, next_token COLLATE BINARY, source_id);
          CREATE INDEX sources_active ON sources(kind, enabled, id);
          CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
          INSERT INTO settings VALUES ('personalLearning', 'false'), ('sourceMode', '"imported"'),
            ('enabledN', '[1,2,3]'), ('indexRevision', '0');
          PRAGMA user_version = 1;
        `);
      })();
      if (version < 2) this.db.transaction(() => {
        this.db.exec(`CREATE TABLE personal_documents (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE CASCADE,
          body_text TEXT NOT NULL,
          byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
          learned_hash TEXT CHECK(learned_hash IS NULL OR length(learned_hash) = 64)
        ); PRAGMA user_version = 2;`);
      })();
      this.personal = new PersonalStore(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  list(): SourceSummary[] {
    const rows = this.db.prepare(`SELECT ${summaryColumns} FROM sources WHERE kind = 'imported' ORDER BY created_at, id LIMIT ?`)
      .all(importLimits.sources) as SourceRow[];
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) }));
  }

  predictionRepository(): PredictionRepository {
    return new SqlitePredictionRepository(this.db);
  }

  getPredictionSettings(): PredictionSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings WHERE key IN ('sourceMode', 'enabledN')").all() as { key: string; value: string }[];
    return validatePredictionSettings(Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)])));
  }

  setPredictionSettings(input: PredictionSettings): PredictionSettings {
    const settings = validatePredictionSettings(input);
    this.db.transaction(() => {
      const update = this.db.prepare('UPDATE settings SET value = ? WHERE key = ?');
      update.run(JSON.stringify(settings.sourceMode), 'sourceMode');
      update.run(JSON.stringify(settings.enabledN), 'enabledN');
    })();
    return settings;
  }

  predictionSourceIds(mode: SourceMode): string[] {
    return (this.db.prepare(`SELECT id FROM sources WHERE enabled = 1 AND
      (kind = 'imported' OR (SELECT value FROM settings WHERE key = 'personalLearning') = 'true') AND
      (? = 'combined' OR kind = ?) ORDER BY id LIMIT ?`).all(mode, mode, importLimits.sources) as { id: string }[]).map((row) => row.id);
  }

  setEnabled(id: string, enabled: boolean): SourceSummary {
    return this.db.transaction(() => {
      const previous = this.summary(id);
      if (previous.enabled !== enabled) {
        this.db.prepare("UPDATE sources SET enabled = ? WHERE id = ? AND kind = 'imported'").run(Number(enabled), id);
        this.advanceRevision();
      }
      return this.summary(id);
    })();
  }

  private summary(id: string): SourceSummary {
    const row = this.db.prepare(`SELECT ${summaryColumns} FROM sources WHERE id = ? AND kind = 'imported'`).get(id) as SourceRow | undefined;
    if (!row) throw new SourceError('This source no longer exists. Refresh the source list.');
    return { ...row, enabled: Boolean(row.enabled) };
  }

  replace(originKey: string, name: string, text: string): 'imported' | 'unchanged' {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > importLimits.fileBytes) throw new SourceError('Each file must be 1 MiB or smaller.');
    const hash = createHash('sha256').update(text, 'utf8').digest('hex');
    const indexed = countNgrams(text);
    return this.db.transaction(() => {
      const old = this.db.prepare("SELECT id, content_hash FROM sources WHERE origin_key = ? AND kind = 'imported'")
        .get(originKey) as { id: string; content_hash: string } | undefined;
      if (old?.content_hash === hash) return 'unchanged' as const;
      const total = this.db.prepare(`SELECT (SELECT COUNT(*) FROM sources) AS count,
        (SELECT COALESCE(SUM(byte_length), 0) FROM documents) +
        (SELECT COALESCE(SUM(byte_length), 0) FROM personal_documents) AS bytes`)
        .get() as { count: number; bytes: number };
      const oldBytes = old ? (this.db.prepare('SELECT byte_length AS bytes FROM documents WHERE source_id = ?').get(old.id) as { bytes: number }).bytes : 0;
      if (!old && total.count >= importLimits.sources) throw new SourceError('The source limit is 100. Delete a source before adding another.');
      if (total.bytes - oldBytes + bytes > importLimits.storedBytes) throw new SourceError('Local source text is limited to 32 MiB. Delete a source and try again.');
      const id = old?.id ?? randomUUID();
      const now = new Date().toISOString();
      if (old) {
        this.db.prepare('UPDATE sources SET display_name = ?, content_hash = ?, token_count = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
          .run(name, hash, indexed.tokenCount, now, id);
        this.db.prepare('UPDATE documents SET body_text = ?, byte_length = ? WHERE source_id = ?').run(text, bytes, id);
      } else {
        this.db.prepare(`INSERT INTO sources(id, kind, origin_key, display_name, revision, content_hash, token_count, created_at, updated_at)
          VALUES (?, 'imported', ?, ?, 1, ?, ?, ?, ?)`).run(id, originKey, name, hash, indexed.tokenCount, now, now);
        this.db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?)').run(randomUUID(), id, text, bytes);
      }
      this.writeCounts(id, indexed.counts);
      return 'imported' as const;
    })();
  }

  reindex(id: string): SourceSummary {
    return this.db.transaction(() => {
      this.summary(id);
      const document = this.db.prepare('SELECT body_text AS text FROM documents WHERE source_id = ?').get(id) as { text: string };
      const indexed = countNgrams(document.text);
      this.writeCounts(id, indexed.counts);
      this.db.prepare('UPDATE sources SET revision = revision + 1, token_count = ?, updated_at = ? WHERE id = ?')
        .run(indexed.tokenCount, new Date().toISOString(), id);
      return this.summary(id);
    })();
  }

  delete(id: string): void {
    this.db.transaction(() => {
      this.summary(id);
      this.db.prepare("DELETE FROM sources WHERE id = ? AND kind = 'imported'").run(id);
      this.advanceRevision();
    })();
  }

  private writeCounts(id: string, counts: ReturnType<typeof countNgrams>['counts']): void {
    this.db.prepare('DELETE FROM ngrams WHERE source_id = ?').run(id);
    const insert = this.db.prepare('INSERT INTO ngrams VALUES (?, ?, ?, ?, ?, ?)');
    for (const row of counts) insert.run(id, row.n, row.context, row.candidate, row.display, row.frequency);
    this.advanceRevision();
  }

  private advanceRevision(): void {
    this.db.prepare("UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'indexRevision'").run();
  }

  close(): void { this.db.close(); }
}
