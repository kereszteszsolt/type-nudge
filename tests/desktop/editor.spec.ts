// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import metadata from '../../package.json';

let application: ElectronApplication;
let page: Page;
let userData: string;
let pageErrors: string[];

test.beforeAll(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'typenudge-smoke-'));
  const executablePath = process.env.TYPENUDGE_EXECUTABLE;
  application = await _electron.launch({
    executablePath,
    args: [...(executablePath ? [] : ['.']), `--user-data-dir=${userData}`],
    chromiumSandbox: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  });
  page = await application.firstWindow();
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await expect(page.getByRole('textbox', { name: 'Document text' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'About', exact: true })).toBeEnabled();
});

test.afterAll(async () => {
  await application?.close();
  if (userData) await rm(userData, { recursive: true, force: true });
});

test('starts one isolated window with restrictive CSP and a narrow bridge', async () => {
  expect(application.windows()).toHaveLength(1);
  await expect(page).toHaveTitle('TypeNudge');
  if (process.platform === 'linux') {
    const pid = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId());
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    expect(status).toMatch(/Seccomp:\s+2/);
    expect(status).toMatch(/NoNewPrivs:\s+1/);
  } else {
    const sandboxed = await application.evaluate(({ app }) => {
      return app.getAppMetrics().filter((metric) => metric.type === 'Tab').map((metric) => metric.sandboxed);
    });
    expect(sandboxed.length).toBeGreaterThan(0);
    expect(sandboxed.every(Boolean)).toBe(true);
  }
  await application.evaluate(async ({ BrowserWindow }) => {
    await BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScriptInIsolatedWorld(999, [{
      code: 'window.__isolationProbe = true',
    }]);
  });
  expect(await page.evaluate(() => '__isolationProbe' in window)).toBe(false);
  expect(await page.evaluate(() => ({
    node: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    bridge: Object.keys(window.typeNudge),
  }))).toEqual({ node: 'undefined', process: 'undefined', bridge: ['getAppInfo', 'openLink'] });
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  await expect(page.locator('header img, dialog img, img[src]')).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('.app-shell')).toHaveCSS('display', 'grid');
  await expect(page.locator('.cm-scroller')).toHaveCSS('font-family', 'Georgia, "Times New Roman", serif');
  await expect(page.locator('.cm-content')).toHaveCSS('padding-top', '30px');
  const editorBounds = await page.getByRole('textbox', { name: 'Document text' }).boundingBox();
  expect(editorBounds?.height).toBeGreaterThan(200);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('editor.png') });
});

test('edits Unicode plain text, selects, copies, pastes and supports undo/redo', async () => {
  const editor = page.getByRole('textbox', { name: 'Document text' });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await editor.fill('Árvíztűrő tükörfúrógép — 日本語');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('A second line');
  await expect(editor.locator('.cm-line')).toHaveText(['Árvíztűrő tükörfúrógép — 日本語', 'A second line']);
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press(`${modifier}+c`);
  expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe('Árvíztűrő tükörfúrógép — 日本語\nA second line');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press(`${modifier}+v`);
  const doubled = ['Árvíztűrő tükörfúrógép — 日本語', 'A second line', 'Árvíztűrő tükörfúrógép — 日本語', 'A second line'];
  await expect(editor.locator('.cm-line')).toHaveText(doubled);
  await page.keyboard.press(`${modifier}+z`);
  await expect(editor.locator('.cm-line')).toHaveCount(3);
  await page.keyboard.press(`${modifier}+Shift+Z`);
  await expect(editor.locator('.cm-line')).toHaveText(doubled);
});

test('Tab leaves the editor; About works with the keyboard and displays package version', async () => {
  const editor = page.getByRole('textbox', { name: 'Document text' });
  await editor.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Support', exact: true })).toBeFocused();
  const about = page.getByRole('button', { name: 'About', exact: true });
  await about.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Version ${metadata.version}`);
  await expect(dialog).toContainText('Keresztes Zsolt');
  await expect(dialog.getByRole('button', { name: 'Project website', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(about).toBeFocused();
});

test('external links need a click, use the allowlist and never navigate this window', async () => {
  await application.evaluate(({ shell }) => {
    (globalThis as unknown as { openedLinks: string[] }).openedLinks = [];
    shell.openExternal = async (url) => {
      (globalThis as unknown as { openedLinks: string[] }).openedLinks.push(url);
    };
  });
  const original = page.url();
  await expect(page.getByRole('button', { name: 'Support', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Support', exact: true }).click();
  expect(await application.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks))
    .toEqual(['https://kereszteszsolt.hu/ways-to-support']);
  expect(await page.evaluate(async () => {
    try {
      await window.typeNudge.openLink('https://example.com' as never);
      return 'allowed';
    } catch { return 'rejected'; }
  })).toBe('rejected');
  expect(page.url()).toBe(original);
  expect(application.windows()).toHaveLength(1);
});

test('remote connections and popups are blocked; the editor fits a small window', async () => {
  expect(await page.evaluate(async () => {
    try { await fetch('https://example.com/'); return 'allowed'; } catch { return 'blocked'; }
  })).toBe('blocked');
  await page.evaluate(() => { window.open('https://example.com/'); });
  expect(application.windows()).toHaveLength(1);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(520, 480));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(520);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Document text' })).toBeVisible();
});
