// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { Worker } from 'node:worker_threads';
import type { StoreAccess } from './access';
import type { IndexProgress } from '../../shared/sources';
import { SourceError } from './errors';

interface Pending { method: string; args: unknown[]; resolve: (value: unknown) => void; reject: (error: Error) => void }
export class StorageClient {
  readonly store: StoreAccess;
  private readonly worker: Worker;
  private readonly queue: Pending[] = [];
  private current?: Pending;
  private stopped = false;
  private indexProgress: IndexProgress = { words: 0, active: false };
  constructor(filename: string, workerPath: string) {
    this.worker = new Worker(workerPath, { workerData: { filename } });
    this.worker.on('error', () => this.fail());
    this.worker.on('exit', () => this.fail());
    this.worker.on('message', (reply) => {
      if (reply.progress) { this.indexProgress = reply.progress; return; }
      const pending = this.current;
      this.current = undefined;
      this.indexProgress = { words: 0, active: false };
      if (pending) {
        if (reply.error) pending.reject(new SourceError(reply.error)); else pending.resolve(reply.value);
      }
      this.next();
    });
    this.store = {
      storageUsage: () => this.call('storageUsage'),
      list: () => this.call('list'), checkFiles: () => this.call('checkFiles'), importFiles: (paths) => this.call('importFiles', paths),
      reindex: (id) => this.call('reindex', id), delete: (id) => this.call('delete', id),
      clearUnavailable: (id) => this.call('clearUnavailable', id), setEnabled: (id, enabled) => this.call('setEnabled', id, enabled),
      getPredictionSettings: () => this.call('getPredictionSettings'), setPredictionSettings: (settings) => this.call('setPredictionSettings', settings),
      predict: (input) => this.call('predict', input), progress: () => this.indexProgress,
      personal: {
        learning: () => this.call('personalConsent'), list: () => this.call('personalList'), open: (id) => this.call('personalOpen', id),
        save: (input) => this.call('personalSave', input), delete: (id) => this.call('personalDelete', id),
        setLearning: (enabled) => this.call('personalLearning', enabled), setEnabled: (id, enabled) => this.call('personalEnabled', id, enabled),
        forget: (id) => this.call('personalForget', id), reset: () => this.call('personalReset'),
      },
    };
  }
  private call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (this.stopped) return Promise.reject(new SourceError('Local storage is unavailable. Reopen TypeNudge to retry.'));
    // Coalesce obsolete queued predictions; never build an unbounded typing backlog.
    if (method === 'predict') {
      const previous = this.queue.findIndex((item) => item.method === 'predict');
      if (previous >= 0) this.queue.splice(previous, 1)[0]!.reject(new SourceError('Prediction superseded.'));
    }
    if (this.queue.length >= 32) return Promise.reject(new SourceError('Local storage is busy. Please try again.'));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ method, args, resolve: (value) => resolve(value as T), reject });
      this.next();
    });
  }
  private next(): void {
    if (this.current || this.stopped) return;
    this.current = this.queue.shift();
    if (this.current) this.worker.postMessage({ id: 1, method: this.current.method, args: this.current.args });
  }
  private fail(): void {
    this.stopped = true;
    this.indexProgress = { words: 0, active: false };
    for (const pending of [...(this.current ? [this.current] : []), ...this.queue.splice(0)]) {
      pending.reject(new SourceError('Local storage stopped. Reopen TypeNudge to retry.'));
    }
    this.current = undefined;
  }
  async close(): Promise<void> { this.fail(); await this.worker.terminate(); }
}
