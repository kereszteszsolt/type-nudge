// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { expect, it, vi } from 'vitest';
import type { DesktopBridge } from '../../src/shared/bridge';

const mocks = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke },
}));

it('exposes named operations without raw IPC, events, SQL or filesystem access', async () => {
  await import('../../src/preload');
  const [name, bridge] = mocks.expose.mock.calls[0] as [string, DesktopBridge];
  expect(name).toBe('typeNudge');
  expect(Object.keys(bridge)).toEqual(['getAppInfo', 'openLink']);
  expect(Object.isFrozen(bridge)).toBe(true);
  await bridge.getAppInfo();
  await bridge.openLink('appGithubUrl');
  expect(mocks.invoke.mock.calls).toEqual([['app:info'], ['app:open-link', 'appGithubUrl']]);
});
