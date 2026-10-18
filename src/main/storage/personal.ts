// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { validateSaveDocument, type DocumentSummary, type PersonalState, type SaveDocument, type SavedDocument } from '../../shared/documents';
import { importLimits } from '../../shared/sources';
import { SourceError } from './errors';
import { writeNgrams } from './tokenize';

interface Row extends DocumentSummary { sourceId: string; text: string; hash: string; learnedHash: string | null }
const columns = `p.id, s.id AS sourceId, s.display_name AS name, s.revision, s.updated_at AS updatedAt,
  s.index_max_n AS indexMaxN, s.enabled, s.token_count AS tokenCount, s.content_hash AS hash, p.learned_hash AS learnedHash`;

export class PersonalStore {
  constructor(private readonly db: Database.Database, private readonly progress?: (words: number) => void) {}
  learning(): boolean {
    return (this.db.prepare("SELECT value FROM settings WHERE key = 'personalLearning'").get() as { value: string }).value === 'true';
  }
  list(): PersonalState {
    const rows = this.db.prepare(`SELECT ${columns} FROM personal_documents p JOIN sources s ON s.id = p.source_id
      WHERE s.kind = 'personal' ORDER BY s.updated_at DESC, p.id LIMIT ?`).all(importLimits.sources) as Row[];
    return { learning: this.learning(), documents: rows.map((row) => this.summary(row)) };
  }
  private summary(row: Row): DocumentSummary {
    return { id: row.id, name: row.name, revision: row.revision, updatedAt: row.updatedAt,
      indexMaxN: row.indexMaxN, enabled: Boolean(row.enabled), learned: row.learnedHash !== null, tokenCount: row.tokenCount };
  }
  private row(id: string): Row {
    const row = this.db.prepare(`SELECT ${columns}, p.body_text AS text FROM personal_documents p JOIN sources s ON s.id = p.source_id
      WHERE p.id = ? AND s.kind = 'personal'`).get(id) as Row | undefined;
    if (!row) throw new SourceError('This document no longer exists. Reopen Documents to refresh.');
    return row;
  }
  open(id: string): SavedDocument { const row = this.row(id); return { ...this.summary(row), text: row.text }; }
  save(input: SaveDocument): DocumentSummary {
    const value = validateSaveDocument(input);
    const bytes = Buffer.byteLength(value.text, 'utf8');
    if (bytes > importLimits.personalBytes) throw new SourceError(`Each document must be ${importLimits.personalBytes / 1024 ** 2} MiB or smaller.`);
    return this.db.transaction(() => {
      const old = value.id ? this.row(value.id) : undefined;
      if (old && old.revision !== value.revision) throw new SourceError('This document changed since it was opened. Reopen it before saving again.');
      const total = this.db.prepare(`SELECT (SELECT COUNT(*) FROM sources) AS count,
        (SELECT COALESCE(SUM(byte_length), 0) FROM documents) +
        (SELECT COALESCE(SUM(byte_length), 0) FROM personal_documents) AS bytes`).get() as { count: number; bytes: number };
      if (!old && total.count >= importLimits.sources) throw new SourceError('The source/document limit is 100. Delete an item before adding another.');
      if (total.bytes - Buffer.byteLength(old?.text ?? '', 'utf8') + bytes > importLimits.storedBytes) throw new SourceError('Local stored text is limited to 32 MiB. Delete an item and try again.');
      const hash = createHash('sha256').update(value.text, 'utf8').digest('hex');
      const learn = this.learning();
      const needsIndex = learn && (old?.learnedHash !== hash || old.indexMaxN < 7);
      if (old && old.hash === hash && old.name === value.name && (learn ? old.learnedHash === hash && !needsIndex : old.learnedHash === null)) return this.summary(old);
      const id = old?.id ?? randomUUID(), sourceId = old?.sourceId ?? randomUUID();
      const now = new Date().toISOString();
      const tokenCount = learn ? old?.tokenCount ?? 0 : 0;
      if (old) {
        this.db.prepare('UPDATE sources SET display_name = ?, content_hash = ?, token_count = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
          .run(value.name, hash, tokenCount, now, sourceId);
        this.db.prepare('UPDATE personal_documents SET body_text = ?, byte_length = ?, learned_hash = ? WHERE id = ?')
          .run(value.text, bytes, learn ? hash : null, id);
      } else {
        this.db.prepare(`INSERT INTO sources(id, kind, display_name, revision, content_hash, token_count, created_at, updated_at)
          VALUES (?, 'personal', ?, 1, ?, ?, ?, ?)`).run(sourceId, value.name, hash, tokenCount, now, now);
        this.db.prepare('INSERT INTO personal_documents VALUES (?, ?, ?, ?, ?)').run(id, sourceId, value.text, bytes, learn ? hash : null);
      }
      if (needsIndex) {
        const tokens = writeNgrams(this.db, sourceId, value.text, this.progress);
        this.db.prepare('UPDATE sources SET token_count = ? WHERE id = ?').run(tokens, sourceId);
      } else if (!learn) this.db.prepare('DELETE FROM ngrams WHERE source_id = ?').run(sourceId);
      this.advance();
      return this.summary(this.row(id));
    })();
  }
  setLearning(enabled: boolean): void {
    this.db.transaction(() => {
      if (this.learning() === enabled) return;
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'personalLearning'").run(JSON.stringify(enabled));
      this.advance();
    })();
  }
  setEnabled(id: string, enabled: boolean): void {
    this.db.transaction(() => {
      const old = this.row(id);
      if (Boolean(old.enabled) === enabled) return;
      this.db.prepare('UPDATE sources SET enabled = ? WHERE id = ?').run(Number(enabled), old.sourceId);
      this.advance();
    })();
  }
  forget(id: string): void {
    this.db.transaction(() => {
      const old = this.row(id);
      this.db.prepare('DELETE FROM ngrams WHERE source_id = ?').run(old.sourceId);
      this.db.prepare('UPDATE sources SET token_count = 0 WHERE id = ?').run(old.sourceId);
      this.db.prepare('UPDATE personal_documents SET learned_hash = NULL WHERE id = ?').run(id);
      this.advance();
    })();
  }
  delete(id: string): void {
    this.db.transaction(() => { this.db.prepare("DELETE FROM sources WHERE id = ? AND kind = 'personal'").run(this.row(id).sourceId); this.advance(); })();
  }
  reset(): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM ngrams WHERE source_id IN (SELECT id FROM sources WHERE kind = 'personal')").run();
      this.db.prepare("UPDATE sources SET token_count = 0 WHERE kind = 'personal'").run();
      this.db.prepare('UPDATE personal_documents SET learned_hash = NULL').run();
      this.db.prepare("UPDATE settings SET value = 'false' WHERE key = 'personalLearning'").run();
      this.advance();
    })();
  }
  private advance(): void { this.db.prepare("UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'indexRevision'").run(); }
}
