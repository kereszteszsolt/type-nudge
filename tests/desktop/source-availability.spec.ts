// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

test('offers indexed cleanup only for unavailable files, rechecks restoration and preserves other sources', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'typenudge-availability-'));
  const lost = path.join(userData, 'lost.txt'), remaining = path.join(userData, 'remaining.md'), empty = path.join(userData, 'empty.txt');
  let application: ElectronApplication | undefined, page: Page;
  const environment = Object.fromEntries(Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[0].toUpperCase() !== 'ELECTRON_RUN_AS_NODE',
  ));
  async function launch(): Promise<void> {
    const executablePath = process.env.TYPENUDGE_EXECUTABLE;
    application = await _electron.launch({ executablePath,
      args: [...(executablePath ? [] : ['.']), `--user-data-dir=${userData}`], chromiumSandbox: true, env: environment });
    page = await application.firstWindow();
    await expect(page.getByRole('textbox', { name: 'Document text' })).toBeVisible();
    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await expect(page.locator('#sources-dialog')).toHaveAttribute('aria-busy', 'false');
  }
  async function close(): Promise<void> {
    if (!application) return;
    await application.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
    await application.close(); application = undefined;
  }
  function inspect<T>(operation: (db: Database.Database) => T): T {
    const db = new Database(path.join(userData, 'typenudge.sqlite3'), { readonly: true });
    try { return operation(db); } finally { db.close(); }
  }
  try {
    await Promise.all([writeFile(lost, 'onlysource word sample'), writeFile(remaining, 'remaining text source'), writeFile(empty, '')]);
    await launch();
    await expect(page!.locator('#import-limits')).toContainText('5 MiB each, 10 MiB per selection, 500,000 words');
    await application!.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected }); }, [lost, remaining, empty]);
    await page!.getByRole('button', { name: 'Import TXT / MD', exact: true }).click();
    await expect(page!.locator('#sources-status')).toHaveText('3 imported · 0 unchanged');
    const row = (name: string) => page!.getByRole('list', { name: 'Imported sources' }).getByRole('listitem').filter({ hasText: name });
    await expect(row('lost.txt')).toContainText('Original file available');
    await expect(page!.getByRole('button', { name: /^Clear index / })).toHaveCount(0);
    const id = inspect((db) => (db.prepare("SELECT id FROM sources WHERE display_name = 'lost.txt'").get() as { id: string }).id);
    const before = inspect((db) => db.prepare('SELECT * FROM ngrams ORDER BY source_id, n, context_key, next_token').all());
    const metadata = await page!.evaluate(() => window.typeNudge.checkSourceFiles());
    expect(metadata.ok).toBe(true); expect(JSON.stringify(metadata)).not.toContain(userData);
    await Promise.all([rm(lost), rm(empty)]);
    await page!.getByRole('button', { name: 'Check files', exact: true }).click();
    await expect(page!.locator('#sources-status')).toHaveText('File availability checked.');
    await expect(row('lost.txt')).toContainText('Original file missing');
    await expect(row('lost.txt').getByRole('button', { name: 'Clear index lost.txt', exact: true })).toBeVisible();
    await expect(row('remaining.md').getByRole('button', { name: /^Clear index / })).toHaveCount(0);
    await expect(row('empty.txt').getByRole('button', { name: /^Clear index / })).toHaveCount(0);
    await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(520, 480));
    expect(await page!.locator('#sources-dialog').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page!.screenshot({ path: test.info().outputPath('missing-index.png') });
    await writeFile(lost, 'restored original');
    await row('lost.txt').getByRole('button', { name: 'Clear index lost.txt', exact: true }).click();
    await expect(page!.locator('#sources-status')).toContainText('only be cleared here');
    await expect(row('lost.txt')).toContainText('Original file available');
    await expect(row('lost.txt').getByRole('button', { name: /^Clear index / })).toHaveCount(0);
    expect(inspect((db) => db.prepare('SELECT * FROM ngrams ORDER BY source_id, n, context_key, next_token').all())).toEqual(before);
    await rm(lost);
    await page!.getByRole('button', { name: 'Check files', exact: true }).click();
    await row('lost.txt').getByRole('button', { name: 'Clear index lost.txt', exact: true }).click();
    await expect(page!.locator('#sources-status')).toContainText('stored text/index deleted');
    await expect(row('lost.txt')).toHaveCount(0);
    for (const table of ['sources', 'documents', 'ngrams', 'imported_files']) {
      expect(inspect((db) => db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${table === 'sources' ? 'id' : 'source_id'} = ?`).get(id))).toEqual({ count: 0 });
    }
    const retained = inspect((db) => db.prepare('SELECT * FROM ngrams ORDER BY source_id, n, context_key, next_token').all());
    expect(retained).toEqual((before as { source_id: string }[]).filter((gram) => gram.source_id !== id));
    await close(); await launch();
    await expect(page!.getByRole('list', { name: 'Imported sources' }).getByRole('listitem')).toHaveCount(2);
    expect(inspect((db) => db.prepare('SELECT * FROM ngrams ORDER BY source_id, n, context_key, next_token').all())).toEqual(retained);
    expect(await readFile(remaining, 'utf8')).toBe('remaining text source');
  } finally {
    await close(); await rm(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
