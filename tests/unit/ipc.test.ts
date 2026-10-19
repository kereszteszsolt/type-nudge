// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { registerAppIpc } from '../../src/main/ipc';
import { channels, type AppInfo } from '../../src/shared/bridge';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
  openExternal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
    mocks.handlers.set(channel, handler);
  } },
  shell: { openExternal: mocks.openExternal },
}));

const entry = 'file:///app/renderer/index.html';
const frame = { url: entry };
const contents = { mainFrame: frame };
const current = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
const trusted = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
const appMetadata = {
  appName: 'Test editor', authorName: 'Display author',
  appWebsite: '', appGithubUrl: 'https://github.com/example/editor',
  authorWebsite: 'javascript:alert(1)', authorWaysToSupportUrl: 'https://example.com/support',
};

function call(channel: string, event: IpcMainInvokeEvent, ...args: unknown[]): unknown {
  return mocks.handlers.get(channel)!(event, ...args);
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.openExternal.mockClear();
  registerAppIpc(() => current, entry, appMetadata, '0.1.0-test');
});

describe('minimal privileged IPC', () => {
  it('registers only app info and named external links; returns display metadata and package version', () => {
    expect([...mocks.handlers.keys()]).toEqual([channels.appInfo, channels.openLink]);
    const result = call(channels.appInfo, trusted) as AppInfo;
    expect(result).toMatchObject({ name: 'Test editor', author: 'Display author', version: '0.1.0-test', license: 'Apache-2.0' });
    expect(result.links.map((link) => link.id)).toEqual(['appGithubUrl', 'authorWaysToSupportUrl', 'license']);
    expect(result).not.toHaveProperty('appIcon');
  });

  it('opens only the URL resolved from an approved link ID', async () => {
    await call(channels.openLink, trusted, 'appGithubUrl');
    expect(mocks.openExternal).toHaveBeenCalledExactlyOnceWith('https://github.com/example/editor');
  });

  it.each([
    [], ['https://example.com'], ['appWebsite'], ['authorWebsite'], ['__proto__'],
    [{ id: 'appGithubUrl' }], [null], ['appGithubUrl', 'extra'],
  ])('rejects invalid external link arguments %j', async (...args) => {
    await expect(call(channels.openLink, trusted, ...args)).rejects.toThrow('Unknown external link');
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it('rejects extra arguments on the read-only info method', () => {
    expect(() => call(channels.appInfo, trusted, { path: '/etc/passwd' })).toThrow('no arguments');
  });

  it.each([
    { sender: {}, senderFrame: frame },
    { sender: contents, senderFrame: { url: entry } },
    { sender: contents, senderFrame: null },
  ])('rejects another window, subframe, or missing frame', async (event) => {
    const input = event as unknown as IpcMainInvokeEvent;
    expect(() => call(channels.appInfo, input)).toThrow('Untrusted IPC sender');
    await expect(call(channels.openLink, input, 'appGithubUrl')).rejects.toThrow('Untrusted IPC sender');
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it('keeps the license destination fixed when display metadata contains another URL', async () => {
    registerAppIpc(() => current, entry, { ...appMetadata, license: 'https://example.com/wrong' }, '0.1.0');
    await call(channels.openLink, trusted, 'license');
    expect(mocks.openExternal).toHaveBeenCalledWith('https://www.apache.org/licenses/LICENSE-2.0');
  });

  it('rejects the main frame after it navigates away', () => {
    frame.url = 'https://example.com';
    try {
      expect(() => call(channels.appInfo, trusted)).toThrow('Untrusted IPC sender');
    } finally {
      frame.url = entry;
    }
  });

  it('rejects a closed window', () => {
    registerAppIpc(() => null, entry, appMetadata, '0.1.0');
    expect(() => call(channels.appInfo, trusted)).toThrow('Untrusted IPC sender');
  });
});
