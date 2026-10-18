// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { SourceResult } from './sources';
export const documentChannels = {
  list: 'documents:list', open: 'documents:open', save: 'documents:save', delete: 'documents:delete',
  learning: 'documents:learning', enable: 'documents:enable', forget: 'documents:forget', reset: 'documents:reset',
} as const;
export interface DocumentSummary {
  id: string; name: string; revision: number; updatedAt: string;
  enabled: boolean; learned: boolean; tokenCount: number;
}
export interface PersonalState { documents: DocumentSummary[]; learning: boolean }
export interface SavedDocument extends DocumentSummary { text: string }
export interface SaveDocument { id: string | null; revision: number | null; name: string; text: string }
export interface DocumentsBridge {
  listDocuments(): Promise<SourceResult<PersonalState>>;
  openDocument(id: string): Promise<SourceResult<SavedDocument>>;
  saveDocument(input: SaveDocument): Promise<SourceResult<DocumentSummary>>;
  deleteDocument(id: string): Promise<SourceResult<void>>;
  setPersonalLearning(enabled: boolean): Promise<SourceResult<void>>;
  setDocumentEnabled(id: string, enabled: boolean): Promise<SourceResult<void>>;
  forgetDocument(id: string): Promise<SourceResult<void>>;
  resetPersonalLearning(): Promise<SourceResult<void>>;
}
export function documentId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('A valid document ID is required.');
  return value.toLowerCase();
}
export function validateSaveDocument(input: unknown): SaveDocument {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A document is required.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 4 || Object.keys(value).some((key) => !['id', 'revision', 'name', 'text'].includes(key))) throw new Error('Unexpected document fields.');
  const id = value.id === null ? null : documentId(value.id);
  if (id === null ? value.revision !== null : !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) throw new Error('A saved document revision is required.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 240 || [...value.name].length > 120 || /[\p{C}]/u.test(value.name)) throw new Error('Use a document name of 1–120 characters.');
  if (typeof value.text !== 'string' || value.text.length > 1024 * 1024 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value.text)) throw new Error('Use plain Unicode text, at most 1 MiB.');
  return { id, revision: value.revision as number | null, name: value.name.trim(), text: value.text };
}
