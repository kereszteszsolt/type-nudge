// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { constants } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SourceFileStatus, SourceFileSummary } from '../../shared/sources';
import { SourceError } from './errors';
import type { SourceStore } from './store';

export async function originalFileStatus(filename: string | null): Promise<SourceFileStatus> {
  if (!filename || !path.isAbsolute(filename)) return 'unknown';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = async (): Promise<SourceFileStatus> => {
    try {
      if (!(await stat(filename)).isFile()) return 'unavailable';
      const file = await open(filename, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
      try { return (await file.stat()).isFile() ? 'available' : 'unavailable'; }
      finally { await file.close(); }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
      if (code === 'EACCES' || code === 'EPERM') return 'unavailable';
      return 'unknown';
    }
  };
  try {
    return await Promise.race([check(), new Promise<SourceFileStatus>((resolve) => {
      timer = setTimeout(() => resolve('unknown'), 1500);
    })]);
  } finally { clearTimeout(timer); }
}

export async function listSourceFiles(store: SourceStore): Promise<SourceFileSummary[]> {
  return Promise.all(store.list().map(async (source) => {
    const file = store.originalFile(source.id);
    return { ...source, hasIndex: file.hasIndex, fileStatus: await originalFileStatus(file.path) };
  }));
}

export async function clearUnavailableSource(store: SourceStore, id: string): Promise<void> {
  const file = store.originalFile(id);
  const status = await originalFileStatus(file.path);
  if (!file.hasIndex || (status !== 'missing' && status !== 'unavailable')) {
    throw new SourceError('The index can only be cleared here when the original file is unavailable and a stored index exists. Refresh the source list.');
  }
  store.delete(id);
}
