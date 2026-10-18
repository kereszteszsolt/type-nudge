// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

export class LruCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 256) throw new Error('Cache capacity must be between 1 and 256.');
  }

  get size(): number { return this.entries.size; }

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (this.entries.has(key)) {
      this.entries.delete(key);
      this.entries.set(key, value!);
    }
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void { this.entries.clear(); }
}
