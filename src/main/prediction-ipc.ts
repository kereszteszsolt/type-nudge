// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { ipcMain, type BrowserWindow } from 'electron';
import { predictionChannels, validatePredictionSettings } from '../shared/prediction';
import type { SourceResult } from '../shared/sources';
import { assertTrustedSender } from './ipc-sender';
import { PredictionEngine } from './prediction/engine';
import { normalizePredictionRequest } from './prediction/request';
import type { SourceStore } from './storage/store';

export function registerPredictionIpc(getWindow: () => BrowserWindow | null, entry: string, getStore: () => SourceStore): void {
  let engine: PredictionEngine | undefined;
  function result<T>(operation: () => T): SourceResult<T> {
    try { return { ok: true, value: operation() }; }
    catch { return { ok: false, error: 'Could not load local predictions. Please try again.' }; }
  }
  ipcMain.handle(predictionChannels.settings, (event, ...args: unknown[]) => {
    assertTrustedSender(event, getWindow(), entry);
    if (args.length) throw new Error('Prediction settings takes no arguments.');
    return result(() => getStore().getPredictionSettings());
  });
  ipcMain.handle(predictionChannels.configure, (event, ...args: unknown[]) => {
    assertTrustedSender(event, getWindow(), entry);
    if (args.length !== 1) throw new Error('Provide one settings object.');
    const settings = validatePredictionSettings(args[0]);
    return result(() => {
      const saved = getStore().setPredictionSettings(settings);
      engine?.clearCache();
      return saved;
    });
  });
  ipcMain.handle(predictionChannels.predict, (event, ...args: unknown[]) => {
    assertTrustedSender(event, getWindow(), entry);
    const input = args[0];
    if (args.length !== 1 || !input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some((key) => !['prefix', 'context'].includes(key))) throw new Error('Provide one prefix/context object.');
    const request = normalizePredictionRequest({ ...input, sourceIds: [], enabledN: [1] });
    return result(() => {
      const store = getStore();
      const settings = store.getPredictionSettings();
      engine ??= new PredictionEngine(store.predictionRepository());
      return engine.predict({ ...request, sourceIds: store.predictionSourceIds(settings.sourceMode), enabledN: settings.enabledN });
    });
  });
}
