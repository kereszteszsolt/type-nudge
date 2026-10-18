// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer } from 'electron';
import { channels, type DesktopBridge, type LinkId } from './shared/bridge';
import { sourceChannels } from './shared/sources';

const bridge: DesktopBridge = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke(channels.appInfo),
  openLink: (id: LinkId) => ipcRenderer.invoke(channels.openLink, id),
  listSources: () => ipcRenderer.invoke(sourceChannels.list),
  importSources: () => ipcRenderer.invoke(sourceChannels.import),
  reindexSource: (id: string) => ipcRenderer.invoke(sourceChannels.reindex, id),
  deleteSource: (id: string) => ipcRenderer.invoke(sourceChannels.delete, id),
});

contextBridge.exposeInMainWorld('typeNudge', bridge);
