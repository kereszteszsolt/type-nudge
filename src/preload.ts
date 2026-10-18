// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer } from 'electron';
import { channels, type DesktopBridge, type LinkId } from './shared/bridge';

const bridge: DesktopBridge = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke(channels.appInfo),
  openLink: (id: LinkId) => ipcRenderer.invoke(channels.openLink, id),
});

contextBridge.exposeInMainWorld('typeNudge', bridge);
