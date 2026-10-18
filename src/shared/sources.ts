// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

export const sourceChannels = {
  list: 'sources:list',
  progress: 'sources:progress',
  storage: 'sources:storage',
  checkFiles: 'sources:check-files',
  import: 'sources:import',
  reindex: 'sources:reindex',
  delete: 'sources:delete',
  clearUnavailable: 'sources:clear-unavailable',
  enable: 'sources:enable',
} as const;

export const importLimits = {
  files: 10,
  fileBytes: 5 * 1024 * 1024,
  batchBytes: 10 * 1024 * 1024,
  personalBytes: 1024 * 1024,
  storedBytes: 32 * 1024 * 1024,
  sources: 100,
  tokens: 500_000,
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
  indexMaxN: number;
}

export type SourceFileStatus = 'available' | 'missing' | 'unavailable' | 'unknown';

export interface SourceFileSummary extends SourceSummary {
  fileStatus: SourceFileStatus;
  hasIndex: boolean;
}

export interface ImportReport {
  imported: number;
  unchanged: number;
  canceled: boolean;
  errors: { name: string; message: string }[];
}

export type SourceResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface IndexProgress { readonly words: number; readonly active: boolean }
export interface StorageUsage {
  readonly databaseBytes: number;
  readonly walBytes: number;
  readonly shmBytes: number;
  readonly totalBytes: number;
}

export interface SourcesBridge {
  getIndexProgress(): Promise<SourceResult<IndexProgress>>;
  getStorageUsage(): Promise<SourceResult<StorageUsage>>;
  listSources(): Promise<SourceResult<SourceSummary[]>>;
  checkSourceFiles(): Promise<SourceResult<SourceFileSummary[]>>;
  importSources(): Promise<SourceResult<ImportReport>>;
  reindexSource(id: string): Promise<SourceResult<SourceSummary>>;
  deleteSource(id: string): Promise<SourceResult<void>>;
  clearUnavailableSource(id: string): Promise<SourceResult<void>>;
  setSourceEnabled(id: string, enabled: boolean): Promise<SourceResult<SourceSummary>>;
}
