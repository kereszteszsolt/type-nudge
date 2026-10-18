// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

export function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow | null, entry: string): asserts window is BrowserWindow {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      !event.senderFrame || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entry) {
    throw new Error('Untrusted IPC sender.');
  }
}
