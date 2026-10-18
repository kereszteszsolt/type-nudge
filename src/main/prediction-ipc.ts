// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { ipcMain, type BrowserWindow } from 'electron';
import { defaultNgramScales, predictionChannels, validatePredictionSettings } from '../shared/prediction';
import type { SourceResult } from '../shared/sources';
import { assertTrustedSender } from './ipc-sender';
import { normalizePredictionRequest } from './prediction/request';
import type { StoreAccess } from './storage/access';

export function registerPredictionIpc(getWindow: () => BrowserWindow | null, entry: string, getStore: () => StoreAccess): void {
  async function result<T>(operation: () => T | Promise<T>): Promise<SourceResult<T>> {
    try { return { ok: true, value: await operation() }; }
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
    return result(() => getStore().setPredictionSettings(settings));
  });
  ipcMain.handle(predictionChannels.predict, (event, ...args: unknown[]) => {
    assertTrustedSender(event, getWindow(), entry);
    const input = args[0];
    if (args.length !== 1 || !input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some((key) => !['prefix', 'context', 'avoidWord'].includes(key))) throw new Error('Provide one prefix/context object.');
    const request = normalizePredictionRequest({ ...input, sourceIds: [], maxN: 1, poolSize: 1, previewWords: 1, ngramScales: defaultNgramScales });
    return result(() => getStore().predict({ prefix: request.prefix, context: request.context,
      ...(request.avoidWord === undefined ? {} : { avoidWord: request.avoidWord }) }));
  });
}
