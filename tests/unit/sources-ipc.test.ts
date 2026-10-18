// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type { SourceStore } from '../../src/main/storage/store';
import { registerSourcesIpc } from '../../src/main/sources-ipc';
import { sourceChannels } from '../../src/shared/sources';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
  dialog: vi.fn(), import: vi.fn(), clear: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler) },
  dialog: { showOpenDialog: mocks.dialog },
}));
vi.mock('../../src/main/storage/import', () => ({ importSelectedFiles: mocks.import }));
vi.mock('../../src/main/storage/source-files', () => ({
  listSourceFiles: (sourceStore: SourceStore) => sourceStore.list(), clearUnavailableSource: mocks.clear,
}));

const id = '11111111-1111-4111-8111-111111111111';
const entry = 'file:///app/renderer/index.html';
const frame = { url: entry };
const contents = { mainFrame: frame };
const window = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
const store = { list: vi.fn(), delete: vi.fn(), reindex: vi.fn(), setEnabled: vi.fn() };

function call(channel: string, input = event, ...args: unknown[]): unknown {
  return mocks.handlers.get(channel)!(input, ...args);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.handlers.clear();
  store.list.mockReturnValue([]);
  mocks.dialog.mockResolvedValue({ canceled: true, filePaths: [] });
  registerSourcesIpc(() => window, entry, () => store as unknown as SourceStore);
});

describe('source IPC boundary', () => {
  it('exposes only named source operations and lists metadata from the store', async () => {
    expect([...mocks.handlers.keys()]).toEqual(Object.values(sourceChannels));
    await expect(call(sourceChannels.list)).resolves.toEqual({ ok: true, value: [] });
  });

  it('uses a parented TXT/MD OS picker and honors cancellation without reading a file', async () => {
    await expect(call(sourceChannels.import)).resolves.toMatchObject({ ok: true, value: { canceled: true } });
    expect(mocks.dialog).toHaveBeenCalledWith(window, expect.objectContaining({
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [{ name: 'UTF-8 text and Markdown', extensions: ['txt', 'md'] }],
    }));
    expect(mocks.import).not.toHaveBeenCalled();
  });

  it('passes only main-process dialog paths to ingestion', async () => {
    mocks.dialog.mockResolvedValue({ canceled: false, filePaths: ['/explicitly/chosen.txt'] });
    mocks.import.mockResolvedValue({ imported: 1, unchanged: 0, canceled: false, errors: [] });
    await expect(call(sourceChannels.import)).resolves.toMatchObject({ ok: true, value: { imported: 1 } });
    expect(mocks.import).toHaveBeenCalledExactlyOnceWith(['/explicitly/chosen.txt'], store);
  });

  it.each([sourceChannels.list, sourceChannels.checkFiles, sourceChannels.import])('rejects injected renderer paths or SQL on %s', (channel) => {
    expect(() => call(channel, event, '/etc/passwd')).toThrow('no arguments');
    expect(mocks.dialog).not.toHaveBeenCalled();
    expect(mocks.import).not.toHaveBeenCalled();
  });

  it.each([sourceChannels.reindex, sourceChannels.delete, sourceChannels.clearUnavailable])('validates opaque IDs on %s', async (channel) => {
    for (const args of [[], ['/etc/passwd'], ["'; DROP TABLE sources; --"], [{}], [null], [id, 'extra']]) {
      expect(() => call(channel, event, ...args)).toThrow('valid source ID');
    }
    await expect(call(channel, event, id)).resolves.toMatchObject({ ok: true });
  });

  it('requires a UUID and an actual boolean to toggle one imported source', async () => {
    for (const args of [[], [id], [id, 1], [id, 'false'], [id, null], [id, true, 'extra'], ['/etc/passwd', false]]) {
      expect(() => call(sourceChannels.enable, event, ...args)).toThrow('boolean');
    }
    await expect(call(sourceChannels.enable, event, id, false)).resolves.toMatchObject({ ok: true });
    expect(store.setEnabled).toHaveBeenCalledExactlyOnceWith(id, false);
  });

  it.each(Object.values(sourceChannels))('rejects a different window or subframe on %s', (channel) => {
    for (const input of [
      { sender: {}, senderFrame: frame },
      { sender: contents, senderFrame: { url: entry } },
    ]) expect(() => call(channel, input as unknown as IpcMainInvokeEvent, id)).toThrow('Untrusted IPC sender');
    expect(mocks.dialog).not.toHaveBeenCalled();
    expect(store.list).not.toHaveBeenCalled();
  });

  it('sanitizes private filesystem/database failures and permits retry', async () => {
    store.list.mockImplementationOnce(() => { throw new Error('/private/database/path.sqlite3'); });
    await expect(call(sourceChannels.list)).resolves.toEqual({ ok: false, error: 'Could not update local sources. Please try again.' });
    await expect(call(sourceChannels.list)).resolves.toEqual({ ok: true, value: [] });
  });

  it('serializes mutations while allowing list requests during a pending file dialog', async () => {
    let cancel!: (value: { canceled: boolean; filePaths: string[] }) => void;
    mocks.dialog.mockReturnValue(new Promise((resolve) => { cancel = resolve; }));
    const pending = call(sourceChannels.import);
    await expect(call(sourceChannels.import)).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Another source operation') });
    await expect(call(sourceChannels.delete, event, id)).resolves.toMatchObject({ ok: false });
    await expect(call(sourceChannels.list)).resolves.toMatchObject({ ok: true });
    cancel({ canceled: true, filePaths: [] });
    await pending;
    await expect(call(sourceChannels.delete, event, id)).resolves.toMatchObject({ ok: true });
  });

  it('holds the mutation lock during the final file check and passes only a validated ID to cleanup', async () => {
    let finish!: () => void;
    mocks.clear.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const pending = call(sourceChannels.clearUnavailable, event, id);
    expect(mocks.clear).toHaveBeenCalledExactlyOnceWith(store, id);
    await expect(call(sourceChannels.delete, event, id)).resolves.toMatchObject({ ok: false });
    await expect(call(sourceChannels.checkFiles)).resolves.toMatchObject({ ok: true });
    finish();
    await expect(pending).resolves.toMatchObject({ ok: true });
    await expect(call(sourceChannels.delete, event, id)).resolves.toMatchObject({ ok: true });
  });
});
