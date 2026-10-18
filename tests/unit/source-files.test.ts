// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { originalFileStatus } from '../../src/main/storage/source-files';

const files = vi.hoisted(() => ({ stat: vi.fn(), open: vi.fn(), handleStat: vi.fn(), close: vi.fn() }));
vi.mock('node:fs/promises', () => ({ stat: files.stat, open: files.open }));
const selected = path.resolve('selected.txt');
beforeEach(() => {
  vi.resetAllMocks(); files.stat.mockResolvedValue({ isFile: () => true }); files.handleStat.mockResolvedValue({ isFile: () => true });
  files.open.mockResolvedValue({ stat: files.handleStat, close: files.close }); files.close.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it('accepts only a readable regular file as available', async () => {
  expect(await originalFileStatus(selected)).toBe('available');
  expect(files.close).toHaveBeenCalledOnce();
  files.stat.mockResolvedValue({ isFile: () => false });
  expect(await originalFileStatus(selected)).toBe('unavailable');
});
it.each(['ENOENT', 'ENOTDIR'])('recognizes a missing file or parent: %s', async (code) => {
  files.stat.mockRejectedValue(Object.assign(new Error('private path'), { code }));
  expect(await originalFileStatus(selected)).toBe('missing');
});
it.each(['EACCES', 'EPERM'])('marks denied file access unavailable: %s', async (code) => {
  files.open.mockRejectedValue(Object.assign(new Error('private path'), { code }));
  expect(await originalFileStatus(selected)).toBe('unavailable');
});
it('does not mistake unknown filesystem errors or an unknown location for a missing file', async () => {
  expect(await originalFileStatus(null)).toBe('unknown');
  expect(await originalFileStatus('relative.txt')).toBe('unknown');
  expect(files.stat).not.toHaveBeenCalled();
  files.stat.mockRejectedValue(Object.assign(new Error('private path'), { code: 'EIO' }));
  expect(await originalFileStatus(selected)).toBe('unknown');
});
it('bounds a stalled filesystem check and cannot treat a timeout as permission to clear', async () => {
  vi.useFakeTimers();
  let finish!: (value: { isFile: () => boolean }) => void;
  files.stat.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const pending = originalFileStatus(selected);
  await vi.advanceTimersByTimeAsync(1500);
  expect(await pending).toBe('unknown');
  finish({ isFile: () => true });
  await vi.runAllTimersAsync();
  expect(vi.getTimerCount()).toBe(0);
});
