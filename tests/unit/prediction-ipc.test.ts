// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { registerPredictionIpc } from '../../src/main/prediction-ipc';
import { predictionChannels as channels } from '../../src/shared/prediction';
import type { SourceStore } from '../../src/main/storage/store';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>() }));
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => mocks.handlers.set(name, fn) } }));
const entry = 'file:///app/index.html';
const frame = { url: entry };
const contents = { mainFrame: frame };
const window = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
const id = '11111111-1111-4111-8111-111111111111';
const select = vi.fn(() => [{ word: 'words', display: 'Words', frequency: 2 }]);
const read = vi.fn();
const store = { getPredictionSettings: vi.fn(), setPredictionSettings: vi.fn(), predictionSourceIds: vi.fn(), predictionRepository: vi.fn() };
function call(channel: string, ...args: unknown[]): unknown { return mocks.handlers.get(channel)!(event, ...args); }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.handlers.clear();
  store.getPredictionSettings.mockReturnValue({ sourceMode: 'combined', enabledN: [2] });
  store.setPredictionSettings.mockImplementation((settings) => settings);
  store.predictionSourceIds.mockReturnValue([id]);
  select.mockReturnValue([{ word: 'words', display: 'Words', frequency: 2 }]);
  read.mockImplementation((_ids, operation) => operation({ indexRevision: 1, sourceFingerprint: 'fixture', activeSourceIds: [id], select }));
  store.predictionRepository.mockReturnValue({ read });
  registerPredictionIpc(() => window, entry, () => store as unknown as SourceStore);
});
it('only exposes three named prediction/settings handlers', () => {
  expect([...mocks.handlers.keys()]).toEqual([channels.settings, channels.configure, channels.predict]);
});
it.each(Object.values(channels))('rejects an untrusted sender, subframe, URL or destroyed window on %s', (channel) => {
  for (const input of [{ sender: {} }, { sender: contents, senderFrame: { url: entry } }, { sender: contents, senderFrame: null }]) {
    expect(() => mocks.handlers.get(channel)!(input as IpcMainInvokeEvent)).toThrow('Untrusted');
  }
  frame.url = 'https://example.com/';
  expect(() => call(channel)).toThrow('Untrusted');
  frame.url = entry;
  registerPredictionIpc(() => null, entry, () => store as unknown as SourceStore);
  expect(() => call(channel)).toThrow('Untrusted');
  expect(store.predictionRepository).not.toHaveBeenCalled();
});
it('uses persisted source mode/N settings and never lets the renderer supply SQL, sources or N', () => {
  expect(call(channels.predict, { prefix: 'WO', context: ['Write'] })).toMatchObject({ ok: true, value: { order: 2 } });
  expect(store.predictionSourceIds).toHaveBeenCalledWith('combined');
  expect(read).toHaveBeenCalledWith([id], expect.any(Function));
  expect(select).toHaveBeenCalledExactlyOnceWith(2, '["write"]', 'wo');
  for (const input of [{ prefix: 'w', context: [], sourceIds: [id] }, { prefix: 'w', context: [], enabledN: [1] }, { sql: 'select *' }]) {
    expect(() => call(channels.predict, input)).toThrow('prefix/context');
  }
});
it('bounds and validates prefix/context before touching storage', () => {
  for (const args of [[], [null], ['text'], [{ prefix: 'a'.repeat(129), context: [] }],
    [{ prefix: 'x', context: ['a', 'b', 'c'] }], [{ prefix: '; drop', context: [] }],
    [{ prefix: '', context: ['two words'] }], [{ prefix: '', context: [] }, 'extra']]) {
    expect(() => call(channels.predict, ...args)).toThrow();
  }
  expect(store.getPredictionSettings).not.toHaveBeenCalled();
});
it('validates settings atomically, preserves the nonempty-N rule and rejects unrelated preferences', () => {
  expect(call(channels.settings)).toMatchObject({ ok: true, value: { enabledN: [2] } });
  expect(() => call(channels.settings, 'extra')).toThrow('no arguments');
  for (const input of [{ sourceMode: 'cloud', enabledN: [1] }, { sourceMode: 'personal', enabledN: [] },
    { sourceMode: 'imported', enabledN: [1, 1] }, { sourceMode: 'combined', enabledN: [4] },
    { sourceMode: 'personal', enabledN: [1], personalLearning: true }, null]) {
    expect(() => call(channels.configure, input)).toThrow();
  }
  expect(store.setPredictionSettings).not.toHaveBeenCalled();
  expect(call(channels.configure, { sourceMode: 'personal', enabledN: [3, 1] })).toEqual({ ok: true, value: { sourceMode: 'personal', enabledN: [1, 3] } });
});
it('sanitizes DB errors without exposing paths/text, and allows retry', () => {
  store.getPredictionSettings.mockImplementationOnce(() => { throw new Error('/private/path.sqlite3'); });
  expect(call(channels.predict, { prefix: 'wo', context: ['write'] })).toEqual({ ok: false, error: 'Could not load local predictions. Please try again.' });
  expect(call(channels.predict, { prefix: 'wo', context: ['write'] })).toMatchObject({ ok: true });
});
