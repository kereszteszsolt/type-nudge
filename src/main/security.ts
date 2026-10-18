// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function localDevEntry(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The development server must use the local loopback address.');
  }
  return url.href;
}

export function allowRequest(request: string, entry: string): boolean {
  try {
    const target = new URL(request);
    const trusted = new URL(entry);
    if (trusted.protocol === 'file:') {
      if (target.protocol !== 'file:') return false;
      const root = path.dirname(fileURLToPath(trusted));
      const relative = path.relative(root, fileURLToPath(target));
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    }
    return (target.protocol === 'http:' || target.protocol === 'ws:') &&
      target.hostname === trusted.hostname && target.port === trusted.port &&
      !target.username && !target.password;
  } catch {
    return false;
  }
}

export function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {
    // Empty or invalid optional links are omitted.
  }
  return undefined;
}
