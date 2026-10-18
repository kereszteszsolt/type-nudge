// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { channels, linkLabels, type AppInfo, type LinkId } from '../shared/bridge';
import { safeExternalUrl } from './security';
import { assertTrustedSender } from './ipc-sender';

export function registerAppIpc(
  getWindow: () => BrowserWindow | null,
  entry: string,
  branding: Record<string, string>,
  version: string,
): void {
  const links = new Map<LinkId, string>();
  for (const id of Object.keys(linkLabels) as LinkId[]) {
    const url = safeExternalUrl(branding[id] ?? '');
    if (url) links.set(id, url);
  }

  const info: AppInfo = {
    name: branding.appName ?? 'TypeNudge',
    version,
    author: branding.authorName ?? '',
    license: branding.license ?? '',
    links: [...links.keys()].map((id) => ({ id, label: linkLabels[id] })),
  };

  function assertSender(event: IpcMainInvokeEvent): void {
    assertTrustedSender(event, getWindow(), entry);
  }

  ipcMain.handle(channels.appInfo, (event, ...args: unknown[]) => {
    assertSender(event);
    if (args.length !== 0) throw new Error('App info takes no arguments.');
    return info;
  });

  ipcMain.handle(channels.openLink, async (event, ...args: unknown[]) => {
    assertSender(event);
    const id = args[0];
    if (args.length !== 1 || typeof id !== 'string' || !links.has(id as LinkId)) {
      throw new Error('Unknown external link.');
    }
    await shell.openExternal(links.get(id as LinkId)!);
  });
}
