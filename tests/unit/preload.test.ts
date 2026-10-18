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
  expect(Object.keys(bridge)).toEqual(['getAppInfo', 'openLink', 'listSources', 'importSources', 'reindexSource', 'deleteSource']);
  expect(Object.isFrozen(bridge)).toBe(true);
  await bridge.getAppInfo();
  await bridge.openLink('appGithubUrl');
  await bridge.listSources();
  await bridge.importSources();
  await bridge.reindexSource('source-id');
  await bridge.deleteSource('source-id');
  expect(mocks.invoke.mock.calls).toEqual([
    ['app:info'], ['app:open-link', 'appGithubUrl'], ['sources:list'], ['sources:import'],
    ['sources:reindex', 'source-id'], ['sources:delete', 'source-id'],
  ]);
});
