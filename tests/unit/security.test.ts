// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { allowRequest, localDevEntry, safeExternalUrl } from '../../src/main/security';

describe('offline request policy', () => {
  const packaged = 'file:///opt/type-nudge/renderer/main_window/index.html';

  it('allows bundled assets and rejects remote or unrelated local files', () => {
    expect(allowRequest(packaged, packaged)).toBe(true);
    expect(allowRequest('file:///opt/type-nudge/renderer/main_window/assets/editor.js', packaged)).toBe(true);
    for (const url of [
      'https://example.com', 'http://127.0.0.1:5173/', 'ws://127.0.0.1:5173/',
      'file:///etc/passwd', 'file:///opt/type-nudge/renderer/main_window-other/secret',
      'file:///opt/type-nudge/renderer/main_window/%2e%2e/private',
      'file://remote/share/file', 'data:text/html,hello', 'not a URL',
    ]) expect(allowRequest(url, packaged), url).toBe(false);
  });

  it('limits development requests and HMR to the selected loopback port', () => {
    const dev = localDevEntry('http://127.0.0.1:5173');
    expect(dev).toBe('http://127.0.0.1:5173/');
    expect(allowRequest('http://127.0.0.1:5173/src/renderer/index.ts', dev)).toBe(true);
    expect(allowRequest('ws://127.0.0.1:5173/?token=test', dev)).toBe(true);
    for (const url of [
      'https://example.com/', 'http://127.0.0.1:5174/', 'http://localhost:5173/',
      'http://127.0.0.1.evil:5173/', 'file:///etc/passwd', 'http://user@127.0.0.1:5173/',
    ]) expect(allowRequest(url, dev), url).toBe(false);
  });

  it.each([
    'https://example.com/', 'http://0.0.0.0:5173/', 'http://127.0.0.1:5173/other',
    'http://user@127.0.0.1:5173/', 'http://127.0.0.1:5173/?remote=true',
    'http://127.0.0.1:5173/#other',
  ])('rejects an unexpected development entry: %s', (value) => {
    expect(() => localDevEntry(value)).toThrow();
  });
});

describe('external link validation', () => {
  it('permits HTTPS URLs without credentials', () => {
    expect(safeExternalUrl('https://kereszteszsolt.hu')).toBe('https://kereszteszsolt.hu/');
  });

  it.each(['', 'invalid', 'javascript:alert(1)', 'file:///etc/passwd', 'http://example.com',
    'https://user:password@example.com'])('omits unsafe or empty link %s', (value) => {
    expect(safeExternalUrl(value)).toBeUndefined();
  });
});
