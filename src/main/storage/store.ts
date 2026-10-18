// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { importLimits, type SourceSummary, type StorageUsage } from '../../shared/sources';
import { SourceError } from './errors';
import { writeNgrams } from './tokenize';
import { importSelectedFiles } from './import';
import { listSourceFiles, clearUnavailableSource } from './source-files';
import { PredictionEngine } from '../prediction/engine';
import type { PredictionInput } from '../../shared/prediction';
import { SqlitePredictionRepository } from '../prediction/sqlite-repository';
import type { PredictionRepository } from '../prediction/types';
import { defaultNgramScales, validatePredictionSettings, type PredictionSettings, type SourceMode } from '../../shared/prediction';
import { PersonalStore } from './personal';

interface SourceRow {
  id: string; name: string; enabled: number; revision: number;
  contentHash: string; tokenCount: number; updatedAt: string; indexMaxN: number;
}

const summaryColumns = `id, display_name AS name, enabled, revision,
  content_hash AS contentHash, token_count AS tokenCount, updated_at AS updatedAt, index_max_n AS indexMaxN`;

export class SourceStore {
  private readonly db: Database.Database;
  readonly personal: PersonalStore;

  private engine?: PredictionEngine;

  constructor(private readonly filename: string, private readonly onIndexProgress?: (words: number) => void) {
    this.db = new Database(filename);
    try {
      const version = this.db.pragma('user_version', { simple: true }) as number;
      if (version > 5) throw new SourceError('This database needs a newer version of TypeNudge.');
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
      if (version < 3) this.db.transaction(() => {
        this.db.exec(`CREATE TABLE imported_files (
          source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
          original_path TEXT NOT NULL
        ); PRAGMA user_version = 3;`);
      })();
      if (version < 4) this.db.transaction(() => {
        this.db.exec(`ALTER TABLE sources ADD COLUMN index_max_n INTEGER NOT NULL DEFAULT 3 CHECK(index_max_n BETWEEN 1 AND 7);
          DROP INDEX ngrams_prefix;
          ALTER TABLE ngrams RENAME TO ngrams_v3;
          CREATE TABLE ngrams (
            source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            n INTEGER NOT NULL CHECK(n BETWEEN 1 AND 7), context_key TEXT NOT NULL,
            next_token TEXT NOT NULL COLLATE BINARY, display_token TEXT NOT NULL,
            frequency INTEGER NOT NULL CHECK(frequency > 0),
            PRIMARY KEY(source_id, n, context_key, next_token)
          ) WITHOUT ROWID;
          INSERT INTO ngrams SELECT * FROM ngrams_v3;
          DROP TABLE ngrams_v3;
          CREATE INDEX ngrams_prefix ON ngrams(n, next_token COLLATE BINARY, source_id);`);
        const old = this.db.prepare("SELECT value FROM settings WHERE key = 'enabledN'").get() as { value: string };
        const selected: unknown = JSON.parse(old.value);
        const maxN = Array.isArray(selected) && selected.length && selected.every((n) => Number.isInteger(n) && n >= 1 && n <= 3)
          ? Math.max(...selected) : 3;
        const insert = this.db.prepare('INSERT INTO settings VALUES (?, ?)');
        for (const [key, value] of Object.entries({ maxN, poolSize: 10, previewWords: 3, acceptWords: 2 })) insert.run(key, JSON.stringify(value));
        this.db.prepare("DELETE FROM settings WHERE key = 'enabledN'").run();
        this.db.pragma('user_version = 4');
      })();
      if (version < 5) this.db.transaction(() => {
        this.db.prepare("INSERT INTO settings VALUES ('ngramScales', ?)").run(JSON.stringify(defaultNgramScales));
        this.db.pragma('user_version = 5');
      })();
      this.personal = new PersonalStore(this.db, onIndexProgress);
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

  async storageUsage(): Promise<StorageUsage> {
    const bytes = async (suffix: string): Promise<number> => {
      try { return (await stat(this.filename + suffix)).size; }
      catch (error) {
        if (suffix && (error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw new SourceError('Could not measure local database size. Please try again.');
      }
    };
    const [databaseBytes, walBytes, shmBytes] = await Promise.all([bytes(''), bytes('-wal'), bytes('-shm')]);
    return { databaseBytes: databaseBytes, walBytes: walBytes, shmBytes: shmBytes,
      totalBytes: databaseBytes + walBytes + shmBytes };
  }

  originalFile(id: string): { path: string | null; hasIndex: boolean } {
    this.summary(id);
    const file = this.db.prepare(`SELECT original_path AS path FROM imported_files WHERE source_id = ?`).get(id) as { path: string } | undefined;
    const indexed = this.db.prepare('SELECT 1 FROM ngrams WHERE source_id = ? LIMIT 1').get(id);
    return { path: file?.path ?? null, hasIndex: Boolean(indexed) };
  }

  predictionRepository(): PredictionRepository {
    return new SqlitePredictionRepository(this.db);
  }

  getPredictionSettings(): PredictionSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings WHERE key IN ('sourceMode', 'maxN', 'poolSize', 'previewWords', 'acceptWords', 'ngramScales')").all() as { key: string; value: string }[];
    return validatePredictionSettings(Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)])));
  }

  setPredictionSettings(input: PredictionSettings): PredictionSettings {
    const settings = validatePredictionSettings(input);
    this.db.transaction(() => {
      const update = this.db.prepare('UPDATE settings SET value = ? WHERE key = ?');
      for (const [key, value] of Object.entries(settings)) update.run(JSON.stringify(value), key);
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

  replace(originKey: string, name: string, text: string, originalPath?: string): 'imported' | 'unchanged' {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > importLimits.fileBytes) throw new SourceError(`Each file must be ${importLimits.fileBytes / 1024 ** 2} MiB or smaller.`);
    const hash = createHash('sha256').update(text, 'utf8').digest('hex');
    return this.db.transaction(() => {
      const old = this.db.prepare("SELECT id, content_hash, index_max_n FROM sources WHERE origin_key = ? AND kind = 'imported'")
        .get(originKey) as { id: string; content_hash: string; index_max_n: number } | undefined;
      const rememberFile = (id: string): void => {
        if (originalPath !== undefined) this.db.prepare(`INSERT INTO imported_files VALUES (?, ?)
          ON CONFLICT(source_id) DO UPDATE SET original_path = excluded.original_path`).run(id, originalPath);
      };
      if (old?.content_hash === hash && old.index_max_n === 7) {
        rememberFile(old.id);
        return 'unchanged' as const;
      }
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
          .run(name, hash, 0, now, id);
        this.db.prepare('UPDATE documents SET body_text = ?, byte_length = ? WHERE source_id = ?').run(text, bytes, id);
      } else {
        this.db.prepare(`INSERT INTO sources(id, kind, origin_key, display_name, revision, content_hash, token_count, created_at, updated_at)
          VALUES (?, 'imported', ?, ?, 1, ?, ?, ?, ?)`).run(id, originKey, name, hash, 0, now, now);
        this.db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?)').run(randomUUID(), id, text, bytes);
      }
      rememberFile(id);
      const tokenCount = writeNgrams(this.db, id, text, this.onIndexProgress);
      this.db.prepare('UPDATE sources SET token_count = ? WHERE id = ?').run(tokenCount, id);
      this.advanceRevision();
      return 'imported' as const;
    })();
  }

  reindex(id: string): SourceSummary {
    return this.db.transaction(() => {
      this.summary(id);
      const document = this.db.prepare('SELECT body_text AS text FROM documents WHERE source_id = ?').get(id) as { text: string };
      const tokenCount = writeNgrams(this.db, id, document.text, this.onIndexProgress);
      this.advanceRevision();
      this.db.prepare('UPDATE sources SET revision = revision + 1, token_count = ?, updated_at = ? WHERE id = ?')
        .run(tokenCount, new Date().toISOString(), id);
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

  private advanceRevision(): void {
    this.db.prepare("UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'indexRevision'").run();
  }

  checkFiles() { return listSourceFiles(this); }
  importFiles(paths: string[]) { return importSelectedFiles(paths, this); }
  clearUnavailable(id: string) { return clearUnavailableSource(this, id); }
  predict(input: PredictionInput) {
    const settings = this.getPredictionSettings();
    this.engine ??= new PredictionEngine(this.predictionRepository());
    return this.engine.predict({ ...input, maxN: settings.maxN, poolSize: settings.poolSize, previewWords: settings.previewWords,
      ngramScales: settings.ngramScales,
      sourceIds: this.predictionSourceIds(settings.sourceMode) });
  }
  close(): void { this.db.close(); }
}
