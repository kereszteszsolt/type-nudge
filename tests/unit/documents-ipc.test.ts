// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { registerDocumentsIpc } from '../../src/main/documents-ipc';
import { documentChannels as channels } from '../../src/shared/documents';
import { SourceError } from '../../src/main/storage/errors';
import type { SourceStore } from '../../src/main/storage/store';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>() }));
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => mocks.handlers.set(name, handler) } }));
const id = '11111111-1111-4111-8111-111111111111';
const entry = 'file:///app/index.html', frame = { url: entry }, contents = { mainFrame: null as unknown };
contents.mainFrame = frame;
const window = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
const personal = { list: vi.fn(), open: vi.fn(), save: vi.fn(), delete: vi.fn(), setLearning: vi.fn(), setEnabled: vi.fn(), forget: vi.fn(), reset: vi.fn() };
const getStore = vi.fn(() => ({ personal }) as unknown as SourceStore);
const call = (channel: string, ...args: unknown[]) => mocks.handlers.get(channel)!(event, ...args);
beforeEach(() => {
  vi.resetAllMocks(); mocks.handlers.clear();
  personal.list.mockReturnValue({ learning: false, documents: [] });
  registerDocumentsIpc(() => window, entry, getStore);
});
it('exposes only bounded document and explicit consent operations', () => {
  expect([...mocks.handlers.keys()]).toEqual(Object.values(channels));
  expect(call(channels.list)).toEqual({ ok: true, value: { learning: false, documents: [] } });
  const input = { id: null, revision: null, name: 'New', text: 'Árvíz\n日本語' };
  call(channels.save, input); expect(personal.save).toHaveBeenCalledExactlyOnceWith(input);
  call(channels.open, id); expect(personal.open).toHaveBeenCalledWith(id);
  call(channels.delete, id); expect(personal.delete).toHaveBeenCalledWith(id);
  call(channels.learning, false); expect(personal.setLearning).toHaveBeenCalledWith(false);
  call(channels.enable, id, false); expect(personal.setEnabled).toHaveBeenCalledWith(id, false);
  call(channels.forget, id); expect(personal.forget).toHaveBeenCalledWith(id);
  call(channels.reset); expect(personal.reset).toHaveBeenCalledOnce();
});
it.each(Object.values(channels))('validates the sender and main frame before storage on %s', (channel) => {
  for (const input of [{ sender: {} }, { sender: contents, senderFrame: { url: entry } }, { sender: contents, senderFrame: null }]) {
    expect(() => mocks.handlers.get(channel)!(input as IpcMainInvokeEvent, id)).toThrow('Untrusted');
  }
  registerDocumentsIpc(() => null, entry, getStore);
  expect(() => call(channel)).toThrow('Untrusted'); expect(getStore).not.toHaveBeenCalled();
});
it.each([channels.list, channels.reset])('rejects paths, SQL or extra arguments on %s', (channel) => {
  expect(() => call(channel, '/etc/passwd')).toThrow('no arguments'); expect(getStore).not.toHaveBeenCalled();
});
it.each([channels.open, channels.delete, channels.forget])('requires one opaque ID on %s', (channel) => {
  for (const args of [[], ['/etc/passwd'], [null], [id, 'extra']]) expect(() => call(channel, ...args)).toThrow();
  expect(getStore).not.toHaveBeenCalled();
});
it('rejects malformed save payloads and arbitrary consent/source overrides before storage', () => {
  const valid = { id: null, revision: null, name: 'Note', text: 'plain' };
  for (const input of [null, {}, { ...valid, text: 'a'.repeat(1024 * 1024 + 1) }, { ...valid, text: '\udfff' },
    { ...valid, id, revision: null }, { ...valid, personalLearning: true }, { ...valid, sourceIds: [id] }, { ...valid, path: '/tmp/note' }]) {
    expect(() => call(channels.save, input)).toThrow();
  }
  for (const value of [1, 'true', null, {}, []]) {
    expect(() => call(channels.learning, value)).toThrow('boolean');
    expect(() => call(channels.enable, id, value)).toThrow('boolean');
  }
  expect(getStore).not.toHaveBeenCalled();
});
it('sanitizes database failures while preserving actionable safe errors and allowing retry', () => {
  personal.list.mockImplementationOnce(() => { throw new Error('/private/note.sqlite3'); });
  expect(call(channels.list)).toEqual({ ok: false, error: 'Could not update local documents. Please try again.' });
  personal.save.mockImplementationOnce(() => { throw new SourceError('This document changed since it was opened.'); });
  expect(call(channels.save, { id, revision: 1, name: 'Note', text: 'safe' })).toEqual({ ok: false, error: 'This document changed since it was opened.' });
  expect(call(channels.list)).toMatchObject({ ok: true });
});
