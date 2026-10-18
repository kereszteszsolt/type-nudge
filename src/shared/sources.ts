// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

export const sourceChannels = {
  list: 'sources:list',
  import: 'sources:import',
  reindex: 'sources:reindex',
  delete: 'sources:delete',
} as const;

export const importLimits = {
  files: 10,
  fileBytes: 1024 * 1024,
  batchBytes: 4 * 1024 * 1024,
  storedBytes: 32 * 1024 * 1024,
  sources: 100,
  tokens: 50_000,
  wordCodePoints: 128,
} as const;

export interface SourceSummary {
  id: string;
  name: string;
  enabled: boolean;
  revision: number;
  contentHash: string;
  tokenCount: number;
  updatedAt: string;
}

export interface ImportReport {
  imported: number;
  unchanged: number;
  canceled: boolean;
  errors: { name: string; message: string }[];
}

export type SourceResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SourcesBridge {
  listSources(): Promise<SourceResult<SourceSummary[]>>;
  importSources(): Promise<SourceResult<ImportReport>>;
  reindexSource(id: string): Promise<SourceResult<SourceSummary>>;
  deleteSource(id: string): Promise<SourceResult<void>>;
}
