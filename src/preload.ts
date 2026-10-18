// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer } from 'electron';
import { channels, type DesktopBridge, type LinkId } from './shared/bridge';
import { sourceChannels } from './shared/sources';
import { predictionChannels, type PredictionInput, type PredictionSettings } from './shared/prediction';
import { documentChannels, type SaveDocument } from './shared/documents';

const bridge: DesktopBridge = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke(channels.appInfo),
  openLink: (id: LinkId) => ipcRenderer.invoke(channels.openLink, id),
  listSources: () => ipcRenderer.invoke(sourceChannels.list),
  checkSourceFiles: () => ipcRenderer.invoke(sourceChannels.checkFiles),
  importSources: () => ipcRenderer.invoke(sourceChannels.import),
  reindexSource: (id: string) => ipcRenderer.invoke(sourceChannels.reindex, id),
  deleteSource: (id: string) => ipcRenderer.invoke(sourceChannels.delete, id),
  clearUnavailableSource: (id: string) => ipcRenderer.invoke(sourceChannels.clearUnavailable, id),
  setSourceEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke(sourceChannels.enable, id, enabled),
  predict: (input: PredictionInput) => ipcRenderer.invoke(predictionChannels.predict, input),
  getPredictionSettings: () => ipcRenderer.invoke(predictionChannels.settings),
  setPredictionSettings: (settings: PredictionSettings) => ipcRenderer.invoke(predictionChannels.configure, settings),
  listDocuments: () => ipcRenderer.invoke(documentChannels.list),
  openDocument: (id: string) => ipcRenderer.invoke(documentChannels.open, id),
  saveDocument: (input: SaveDocument) => ipcRenderer.invoke(documentChannels.save, input),
  deleteDocument: (id: string) => ipcRenderer.invoke(documentChannels.delete, id),
  setPersonalLearning: (enabled: boolean) => ipcRenderer.invoke(documentChannels.learning, enabled),
  setDocumentEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke(documentChannels.enable, id, enabled),
  forgetDocument: (id: string) => ipcRenderer.invoke(documentChannels.forget, id),
  resetPersonalLearning: () => ipcRenderer.invoke(documentChannels.reset),
});

contextBridge.exposeInMainWorld('typeNudge', bridge);
