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
  expect(Object.keys(bridge)).toEqual(['getAppInfo', 'openLink', 'listSources', 'checkSourceFiles', 'importSources', 'reindexSource', 'deleteSource', 'clearUnavailableSource',
    'setSourceEnabled', 'predict', 'getPredictionSettings', 'setPredictionSettings', 'listDocuments', 'openDocument', 'saveDocument',
    'deleteDocument', 'setPersonalLearning', 'setDocumentEnabled', 'forgetDocument', 'resetPersonalLearning']);
  expect(Object.isFrozen(bridge)).toBe(true);
  await bridge.getAppInfo();
  await bridge.openLink('appGithubUrl');
  await bridge.listSources();
  await bridge.checkSourceFiles();
  await bridge.importSources();
  await bridge.reindexSource('source-id');
  await bridge.deleteSource('source-id');
  await bridge.clearUnavailableSource('source-id');
  await bridge.setSourceEnabled('source-id', false);
  await bridge.predict({ prefix: 'wo', context: ['write'] });
  await bridge.getPredictionSettings();
  await bridge.setPredictionSettings({ sourceMode: 'combined', enabledN: [1, 3] });
  const document = { id: null, revision: null, name: 'Note', text: 'text' };
  await bridge.listDocuments(); await bridge.openDocument('note-id'); await bridge.saveDocument(document);
  await bridge.deleteDocument('note-id'); await bridge.setPersonalLearning(true);
  await bridge.setDocumentEnabled('note-id', false); await bridge.forgetDocument('note-id'); await bridge.resetPersonalLearning();
  expect(mocks.invoke.mock.calls).toEqual([
    ['app:info'], ['app:open-link', 'appGithubUrl'], ['sources:list'], ['sources:check-files'], ['sources:import'],
    ['sources:reindex', 'source-id'], ['sources:delete', 'source-id'], ['sources:clear-unavailable', 'source-id'],
    ['sources:enable', 'source-id', false], ['prediction:query', { prefix: 'wo', context: ['write'] }],
    ['prediction:settings'], ['prediction:configure', { sourceMode: 'combined', enabledN: [1, 3] }],
    ['documents:list'], ['documents:open', 'note-id'], ['documents:save', document], ['documents:delete', 'note-id'],
    ['documents:learning', true], ['documents:enable', 'note-id', false], ['documents:forget', 'note-id'], ['documents:reset'],
  ]);
});
