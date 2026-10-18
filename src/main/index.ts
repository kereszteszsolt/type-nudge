// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { app, BrowserWindow, Menu, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import branding from '../../brand/branding.json';
import { registerAppIpc } from './ipc';
import { allowRequest, localDevEntry } from './security';
import { registerSourcesIpc } from './sources-ipc';
import { SourceStore } from './storage/store';
import { registerPredictionIpc } from './prediction-ipc';

app.setName(branding.appName);
app.enableSandbox();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

let window: BrowserWindow | null = null;
let store: SourceStore | undefined;

function getStore(): SourceStore {
  return store ??= new SourceStore(path.join(app.getPath('userData'), 'typenudge.sqlite3'));
}
const entry = MAIN_WINDOW_VITE_DEV_SERVER_URL
  ? localDevEntry(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  : pathToFileURL(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)).href;

function createWindow(): void {
  window = new BrowserWindow({
    title: branding.appName,
    width: 1040,
    height: 780,
    minWidth: 480,
    minHeight: 400,
    backgroundColor: '#f6f5f1',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      webviewTag: false,
    },
  });
  const current = window;
  current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  current.webContents.on('will-navigate', (event) => event.preventDefault());
  current.webContents.on('will-redirect', (event) => event.preventDefault());
  current.webContents.on('will-attach-webview', (event) => event.preventDefault());
  current.once('ready-to-show', () => current.show());
  current.on('closed', () => { window = null; });
  void current.loadURL(entry).catch((error: unknown) => {
    console.error('Failed to load TypeNudge:', error);
    app.quit();
  });
}

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !allowRequest(details.url, entry) });
  });
  session.defaultSession.on('will-download', (event) => event.preventDefault());
  registerAppIpc(() => window, entry, branding, app.getVersion());
  registerSourcesIpc(() => window, entry, getStore);
  registerPredictionIpc(() => window, entry, getStore);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error: unknown) => {
  console.error('Failed to start TypeNudge:', error);
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => store?.close());
