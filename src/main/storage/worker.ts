// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { parentPort, workerData } from 'node:worker_threads';
import { SourceStore } from './store';
import { SourceError } from './errors';

const port = parentPort!;
const store = new SourceStore(workerData.filename, (words) => port.postMessage({ progress: { words, active: true } }));
const operations = {
  storageUsage: store.storageUsage.bind(store),
  list: store.list.bind(store), checkFiles: store.checkFiles.bind(store), importFiles: store.importFiles.bind(store),
  reindex: store.reindex.bind(store), delete: store.delete.bind(store), clearUnavailable: store.clearUnavailable.bind(store),
  setEnabled: store.setEnabled.bind(store), getPredictionSettings: store.getPredictionSettings.bind(store),
  setPredictionSettings: store.setPredictionSettings.bind(store), predict: store.predict.bind(store),
  personalList: store.personal.list.bind(store.personal), personalOpen: store.personal.open.bind(store.personal),
  personalSave: store.personal.save.bind(store.personal), personalDelete: store.personal.delete.bind(store.personal),
  personalLearning: store.personal.setLearning.bind(store.personal), personalEnabled: store.personal.setEnabled.bind(store.personal),
  personalForget: store.personal.forget.bind(store.personal), personalReset: store.personal.reset.bind(store.personal),
  personalConsent: store.personal.learning.bind(store.personal),
};
// Main sends only one operation at a time. Every write owns one SQLite transaction.
port.on('message', async ({ id, method, args }: { id: number; method: keyof typeof operations; args: never[] }) => {
  try {
    if (!Object.hasOwn(operations, method)) throw new Error('Unknown local operation.');
    const value = await (operations[method] as (...args: never[]) => unknown)(...args);
    port.postMessage({ id, value });
  } catch (error) {
    port.postMessage({ id, error: error instanceof SourceError ? error.message : 'Could not update local data. Please try again.' });
  }
});
