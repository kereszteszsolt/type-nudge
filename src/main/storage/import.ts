// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { importLimits, type ImportReport } from '../../shared/sources';
import { SourceError, sourceErrorMessage } from './errors';
import type { SourceStore } from './store';

function displayName(filename: string): string {
  const name = path.basename(filename);
  return name.length <= 255 && !/[\p{Cc}\p{Cf}]/u.test(name) ? name : 'Selected file';
}

async function readSelectedFile(filename: string): Promise<{ text: string; originKey: string; name: string; bytes: number; originalPath: string }> {
  const name = displayName(filename);
  if (!path.isAbsolute(filename) || path.normalize(filename) !== filename || filename.length > 4096 || filename.includes('\0') || name === 'Selected file') {
    throw new SourceError('The selected filename is not supported.');
  }
  if (!['.txt', '.md'].includes(path.extname(filename).toLowerCase())) throw new SourceError('Select a .txt or .md file.');
  // Inspect only the chosen path and its parents, never scan a directory.
  for (let current = filename; ; current = path.dirname(current)) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new SourceError('Symbolic links and linked folders cannot be imported.');
    if (path.dirname(current) === current) break;
  }
  const before = await lstat(filename);
  if (!before.isFile()) throw new SourceError('Select a regular text file.');
  if (before.size > importLimits.fileBytes) throw new SourceError(`Each file must be ${importLimits.fileBytes / 1024 ** 2} MiB or smaller.`);
  const canonical = await realpath(filename);
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || await realpath(filename) !== canonical) {
      throw new SourceError('The selected file changed while opening. Select it again.');
    }
    const buffer = Buffer.alloc(importLimits.fileBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > importLimits.fileBytes) throw new SourceError(`Each file must be ${importLimits.fileBytes / 1024 ** 2} MiB or smaller.`);
    const after = await file.stat();
    if (after.size !== length || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new SourceError('The selected file changed while reading. Select it again.');
    }
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)); }
    catch { throw new SourceError('This file is not valid UTF-8. Save it as UTF-8 and try again.'); }
    // Page/line controls and Unicode separators end contexts; other controls separate words.
    text = text.replace(/[\v\f\u0085\p{Zl}\p{Zp}]/gu, '\n')
      .replace(/(?![\t\n\r])\p{Cc}/gu, ' ');
    const identity = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    return { text, bytes: length, name, originalPath: canonical, originKey: createHash('sha256').update(identity).digest('hex') };
  } finally {
    await file.close();
  }
}

export async function importSelectedFiles(paths: string[], store: SourceStore): Promise<ImportReport> {
  if (paths.length > importLimits.files) throw new SourceError('Select at most 10 files at a time.');
  const report: ImportReport = { imported: 0, unchanged: 0, canceled: false, errors: [] };
  const files: Awaited<ReturnType<typeof readSelectedFile>>[] = [];
  let totalBytes = 0;
  for (const filename of paths) {
    try {
      const file = await readSelectedFile(filename);
      totalBytes += file.bytes;
      if (totalBytes > importLimits.batchBytes) throw new SourceError(`A selection can contain at most ${importLimits.batchBytes / 1024 ** 2} MiB of text. Import fewer files.`);
      files.push(file);
    } catch (error) {
      if (error instanceof SourceError && totalBytes > importLimits.batchBytes) throw error;
      report.errors.push({ name: displayName(filename), message: error instanceof SourceError ? error.message : 'The selected file could not be read. Check its permissions and try again.' });
    }
  }
  for (const file of files) {
    await setImmediate();
    try { report[store.replace(file.originKey, file.name, file.text, file.originalPath)]++; }
    catch (error) { report.errors.push({ name: file.name, message: sourceErrorMessage(error) }); }
  }
  return report;
}
