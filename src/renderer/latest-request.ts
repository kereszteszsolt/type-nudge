// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

// An IPC promise cannot be aborted. A generation also rejects ABA changes and
// pending failures, even when a new caret/context happens to equal the old one.
export class LatestRequest {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  cancel(): void { this.generation++; clearTimeout(this.timer); }
  destroy(): void { this.cancel(); this.disposed = true; }
  schedule<T>(request: () => Promise<T>, accept: (value: T) => void, fail: () => void, delay = 60): void {
    this.cancel();
    if (this.disposed) return;
    const generation = this.generation;
    this.timer = setTimeout(() => {
      void Promise.resolve().then(request).then((value) => {
        if (!this.disposed && generation === this.generation) accept(value);
      }, () => {
        if (!this.disposed && generation === this.generation) fail();
      });
    }, delay);
  }
}
