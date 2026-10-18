// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { ipcMain, type BrowserWindow } from 'electron';
import { documentChannels as channels, documentId, validateSaveDocument } from '../shared/documents';
import type { SourceResult } from '../shared/sources';
import { assertTrustedSender } from './ipc-sender';
import { SourceError } from './storage/errors';
import type { SourceStore } from './storage/store';

export function registerDocumentsIpc(getWindow: () => BrowserWindow | null, entry: string, getStore: () => SourceStore): void {
  function result<T>(operation: () => T): SourceResult<T> {
    try { return { ok: true, value: operation() }; }
    catch (error) { return { ok: false, error: error instanceof SourceError ? error.message : 'Could not update local documents. Please try again.' }; }
  }
  for (const channel of Object.values(channels)) ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedSender(event, getWindow(), entry);
    if (channel === channels.list || channel === channels.reset) {
      if (args.length) throw new Error('This document operation takes no arguments.');
      return result(() => channel === channels.list ? getStore().personal.list() : getStore().personal.reset());
    }
    if (channel === channels.save) {
      if (args.length !== 1) throw new Error('Provide one document object.');
      const input = validateSaveDocument(args[0]);
      return result(() => getStore().personal.save(input));
    }
    if (channel === channels.learning) {
      if (args.length !== 1 || typeof args[0] !== 'boolean') throw new Error('A boolean learning preference is required.');
      return result(() => getStore().personal.setLearning(args[0] as boolean));
    }
    const id = documentId(args[0]);
    if (channel === channels.enable) {
      if (args.length !== 2 || typeof args[1] !== 'boolean') throw new Error('A document ID and boolean enabled flag are required.');
      return result(() => getStore().personal.setEnabled(id, args[1] as boolean));
    }
    if (args.length !== 1) throw new Error('Provide one document ID.');
    return result(() => {
      const personal = getStore().personal;
      if (channel === channels.open) return personal.open(id);
      if (channel === channels.delete) return personal.delete(id);
      return personal.forget(id);
    });
  });
}
