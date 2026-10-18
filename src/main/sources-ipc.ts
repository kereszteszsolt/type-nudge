// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { sourceChannels, type SourceResult, type ImportReport } from '../shared/sources';
import { assertTrustedSender } from './ipc-sender';
import { SourceError, sourceErrorMessage } from './storage/errors';
import { importSelectedFiles } from './storage/import';
import type { SourceStore } from './storage/store';
import { clearUnavailableSource, listSourceFiles } from './storage/source-files';

export function registerSourcesIpc(getWindow: () => BrowserWindow | null, entry: string, getStore: () => SourceStore): void {
  let busy = false;
  async function result<T>(operation: () => T | Promise<T>): Promise<SourceResult<T>> {
    try { return { ok: true, value: await operation() }; }
    catch (error) { return { ok: false, error: sourceErrorMessage(error) }; }
  }
  async function mutate<T>(operation: () => T | Promise<T>): Promise<T> {
    if (busy) throw new SourceError('Another source operation is running. Please wait and try again.');
    busy = true;
    try { return await operation(); } finally { busy = false; }
  }

  for (const channel of [sourceChannels.list, sourceChannels.checkFiles]) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertTrustedSender(event, getWindow(), entry);
      if (args.length !== 0) throw new Error('List/check sources takes no arguments.');
      return result(() => channel === sourceChannels.list ? getStore().list() : listSourceFiles(getStore()));
    });
  }
  ipcMain.handle(sourceChannels.import, (event, ...args: unknown[]) => {
    const window = getWindow();
    assertTrustedSender(event, window, entry);
    if (args.length !== 0) throw new Error('Import sources takes no arguments.');
    return result(() => mutate(async (): Promise<ImportReport> => {
      const selection = await dialog.showOpenDialog(window, {
        title: 'Import text sources',
        properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
        filters: [{ name: 'UTF-8 text and Markdown', extensions: ['txt', 'md'] }],
      });
      if (selection.canceled || selection.filePaths.length === 0) {
        return { imported: 0, unchanged: 0, canceled: true, errors: [] };
      }
      return importSelectedFiles(selection.filePaths, getStore());
    }));
  });
  for (const [channel, action] of [
    [sourceChannels.reindex, (store: SourceStore, id: string) => store.reindex(id)],
    [sourceChannels.delete, (store: SourceStore, id: string) => store.delete(id)],
    [sourceChannels.clearUnavailable, (store: SourceStore, id: string) => clearUnavailableSource(store, id)],
  ] as const) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertTrustedSender(event, getWindow(), entry);
      const id = args[0];
      if (args.length !== 1 || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('A valid source ID is required.');
      }
      return result(() => mutate(() => action(getStore(), id)));
    });
  }
  ipcMain.handle(sourceChannels.enable, (event, ...args: unknown[]) => {
    assertTrustedSender(event, getWindow(), entry);
    const [id, enabled] = args;
    if (args.length !== 2 || typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || typeof enabled !== 'boolean') {
      throw new Error('A valid source ID and boolean enabled flag are required.');
    }
    return result(() => mutate(() => getStore().setEnabled(id, enabled)));
  });
}
