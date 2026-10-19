// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import metadata from '../../package.json';
import Database from 'better-sqlite3';

let application: ElectronApplication;
let page: Page;
let userData: string;
let pageErrors: string[];

async function launchApplication(): Promise<void> {
  const executablePath = process.env.TYPENUDGE_EXECUTABLE;
  const environment = Object.fromEntries(Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[0].toUpperCase() !== 'ELECTRON_RUN_AS_NODE',
  ));
  application = await _electron.launch({
    executablePath,
    args: [...(executablePath ? [] : ['.']), `--user-data-dir=${userData}`],
    chromiumSandbox: true,
    env: environment,
  });
  page = await application.firstWindow();
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await expect(page.getByRole('textbox', { name: 'Document text' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'About', exact: true })).toBeEnabled();
}

async function configure(values: {sourceMode?:string; maxN?:number; poolSize?:number; previewWords?:number; acceptWords?:number}): Promise<void> {
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  for(const [key,value] of Object.entries(values)) {
    const id=({sourceMode:'prediction-source',maxN:'maximum-n',poolSize:'pool-size',previewWords:'preview-words',acceptWords:'accept-words'} as Record<string,string>)[key]!;
    const input=page.locator('#'+id);await expect(input).toBeEnabled();
    if(key==='sourceMode') await input.selectOption(String(value));
    else { await input.evaluate((el,value)=>{(el as HTMLInputElement).value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));},value); }
    await expect(input).toBeEnabled();
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-dialog')).toBeHidden();
}

async function closeApplication(): Promise<void> {
  if (!application) return;
  await application.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
  await application.close();
}

test.beforeAll(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'typenudge-smoke-'));
  await launchApplication();
  await configure({poolSize:1,previewWords:1});
});

test.afterAll(async () => {
  await closeApplication();
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
  }))).toEqual({ node: 'undefined', process: 'undefined', bridge: ['getAppInfo', 'openLink', 'getIndexProgress', 'getStorageUsage', 'listSources', 'checkSourceFiles', 'importSources', 'reindexSource', 'deleteSource', 'clearUnavailableSource',
    'setSourceEnabled', 'predict', 'getPredictionSettings', 'setPredictionSettings', 'listDocuments', 'openDocument', 'saveDocument',
    'deleteDocument', 'setPersonalLearning', 'setDocumentEnabled', 'forgetDocument', 'resetPersonalLearning'] });
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
  await page.keyboard.press(process.platform === 'win32' ? 'Control+y' : `${modifier}+Shift+Z`);
  await expect(editor.locator('.cm-line')).toHaveText(doubled);
});

test('Tab leaves the editor; About works with the keyboard and displays package version', async () => {
  const editor = page.getByRole('textbox', { name: 'Document text' });
  await editor.focus(); await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await expect(editor).not.toBeFocused();
  const about = page.getByRole('button', { name: 'About', exact: true });
  await about.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Version ${metadata.version}`);
  await expect(dialog).toContainText('Keresztes Zsolt');
  await expect(dialog.getByRole('button', { name: 'Ways to support', exact: true })).toBeVisible();
  await expect(page.locator('.status-bar .license-link')).toHaveText('Apache-2.0');
  await expect(page.locator('.status-bar .author-website')).toHaveText('kereszteszsolt.hu');
  await expect(page.locator('.status-bar').getByRole('button', { name: 'Ways to support', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('about-support.png') });
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
  await expect(page.locator('.status-bar .license-link')).toHaveText('Apache-2.0');
  await expect(page.locator('.status-bar .author-website')).toHaveText('kereszteszsolt.hu');
  await expect(page.locator('.status-bar').getByRole('button', { name: 'Ways to support', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'About', exact: true }).click();
  expect(await application.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks)).toEqual([]);
  await page.getByRole('dialog', { name: 'About TypeNudge' }).getByRole('button', { name: 'Ways to support', exact: true }).click();
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
  await page.keyboard.press('Escape');
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

test('imports selected files, replaces/reindexes/deletes independently and persists the SQLite store', async () => {
  expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(userData);
  const first = path.join(userData, 'chosen-hu.txt');
  const second = path.join(userData, 'chosen-en.md');
  const invalid = path.join(userData, 'invalid.txt');
  await writeFile(first, 'Árvíz árvíz tükör.');
  await writeFile(second, 'Other text.');
  await writeFile(invalid, Buffer.from([0xc3, 0x28]));

  async function select(paths: string[], canceled = false): Promise<void> {
    await application.evaluate(({ dialog }, selection) => {
      dialog.showOpenDialog = async () => selection;
    }, { canceled, filePaths: paths });
  }
  function inspect<T>(query: (db: Database.Database) => T): T {
    const db = new Database(path.join(userData, 'typenudge.sqlite3'), { readonly: true });
    try { return query(db); } finally { db.close(); }
  }
  const open = () => page.getByRole('button', { name: 'Sources', exact: true }).click();
  const status = () => page.locator('#sources-status');
  const imported = () => page.getByRole('list', { name: 'Imported sources' }).getByRole('listitem');
  const importFiles = () => page.getByRole('button', { name: 'Import TXT / MD', exact: true }).click();

  await open();
  await expect(page.locator('#sources-empty')).toBeVisible();
  await select([], true);
  await importFiles();
  await expect(status()).toHaveText('Import canceled.');
  await select([first, second, invalid]);
  await importFiles();
  await expect(status()).toContainText('2 imported · 0 unchanged');
  await expect(status()).toContainText('not valid UTF-8');
  await expect(imported()).toHaveCount(2);
  const firstId = inspect((db) => (db.prepare("SELECT id FROM sources WHERE display_name = 'chosen-hu.txt'").get() as { id: string }).id);
  expect(inspect((db) => db.prepare('SELECT frequency FROM ngrams WHERE source_id = ? AND n = 1 AND next_token = ?').get(firstId, 'árvíz'))).toEqual({ frequency: 2 });

  await select([first]);
  await importFiles();
  await expect(status()).toHaveText('0 imported · 1 unchanged');
  await writeFile(first, 'Új szöveg.');
  await importFiles();
  await expect(status()).toHaveText('1 imported · 0 unchanged');
  await expect(imported().filter({ hasText: 'chosen-hu.txt' })).toContainText('2 words · Revision 2');
  expect(inspect((db) => db.prepare('SELECT next_token FROM ngrams WHERE source_id = ? AND n = 1 ORDER BY next_token').all(firstId)))
    .toEqual([{ next_token: 'szöveg' }, { next_token: 'új' }]);
  await rm(first);
  await page.getByRole('button', { name: 'Reindex chosen-hu.txt', exact: true }).click();
  await expect(imported().filter({ hasText: 'chosen-hu.txt' })).toContainText('Revision 3');

  await select(Array(11).fill(second));
  await importFiles();
  await expect(status()).toContainText('at most 10 files');
  await expect(imported()).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear index chosen-hu.txt', exact: true }).click();
  await expect(imported()).toHaveCount(1);
  expect(inspect((db) => db.prepare('SELECT COUNT(*) AS count FROM ngrams WHERE source_id = ?').get(firstId))).toEqual({ count: 0 });
  expect(inspect((db) => db.prepare('SELECT COUNT(*) AS count FROM documents WHERE source_id = ?').get(firstId))).toEqual({ count: 0 });
  await page.screenshot({ path: test.info().outputPath('sources.png') });

  await closeApplication();
  await launchApplication();
  await open();
  await expect(imported()).toHaveCount(1);
  await expect(imported()).toContainText('chosen-en.md');
  expect(inspect((db) => db.prepare("SELECT value FROM settings WHERE key = 'personalLearning'").get())).toEqual({ value: 'false' });
  expect(inspect((db) => db.pragma('integrity_check', { simple: true }))).toBe('ok');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Sources', exact: true })).toBeFocused();
});

test('shows real SQLite partial completions and supports Tab, Alt+Down, Esc, copy and undo', async () => {
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1040, 780));
  const fixture = path.join(userData, 'predictions.txt');
  await writeFile(fixture, 'we write words. we write world. we write work. Árvíz árnyék.');
  await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, fixture);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: 'Import TXT / MD', exact: true }).click();
  await expect(page.locator('#sources-status')).toContainText('1 imported');
  await page.keyboard.press('Escape');
  await configure({poolSize:1,previewWords:1});
  const editor = page.getByRole('textbox', { name: 'Document text' });
  const ghost = page.locator('.cm-ghost');
  await editor.fill('we write wo');
  await page.keyboard.press('End');
  await expect(ghost).toHaveText('rds');
  await expect(ghost).toHaveAttribute('aria-hidden', 'true');
  await configure({poolSize:3});
  await editor.focus(); await page.keyboard.press('End');
  await expect(ghost).toHaveText(/^(rds|rk|rld)$/);
  const first=await ghost.textContent();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(ghost).toHaveText(/^(rds|rk|rld)$/);
  await expect(ghost).not.toHaveText(first!);
  await configure({poolSize:1});
  await editor.focus(); await page.keyboard.press('End'); await expect(ghost).toHaveText('rds');
  await page.keyboard.press('Escape');
  await expect(ghost).toHaveCount(0);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press(`${modifier}+c`);
  expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe('we write wo');
  await page.keyboard.press('ArrowRight');
  await expect(ghost).toHaveText('rds');
  await page.screenshot({ path: test.info().outputPath('inline-suggestions.png') });
  await page.keyboard.press('Tab');
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press(`${modifier}+c`);
  expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe('we write words');
  await page.keyboard.press(`${modifier}+z`);
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press(`${modifier}+c`);
  expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe('we write wo');
  await expect(ghost).toHaveCount(0);
  await editor.fill('we write ');
  await page.keyboard.press('End');
  await expect(ghost).toHaveText('we');
  await page.keyboard.press('Tab');
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press(`${modifier}+c`);
  expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe('we write we');
  await editor.fill('Ár');
  await page.keyboard.press('End');
  await configure({poolSize:2}); await editor.focus(); await page.keyboard.press('End');
  await expect(ghost).toHaveText(/^(nyék|víz)$/);
  if(await ghost.textContent()==='nyék') { await page.keyboard.press('Alt+ArrowDown'); await expect(ghost).toHaveText('víz'); }
  await page.keyboard.press('Tab');
  await expect(editor.locator('.cm-line')).toHaveText('Árvíz');
  await configure({poolSize:1});
});

test('persists source/N settings, prevents an empty N selection and handles no active corpus', async () => {
  const mode = page.getByLabel('Predict from');
  await configure({sourceMode:'personal'});
  await expect(page.locator('#prediction-status')).toContainText('My Writing has no active learned text');
  const editor = page.getByRole('textbox', { name: 'Document text' });
  await editor.fill('we write wo');
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await expect(editor).not.toBeFocused();
  await configure({sourceMode:'combined',maxN:1});
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Use predictions.txt for predictions', exact: true }).uncheck();
  await expect(page.locator('#sources-status')).toContainText('disabled for predictions');
  await page.getByRole('checkbox', { name: 'Use chosen-en.md for predictions', exact: true }).uncheck();
  await expect(page.locator('#sources-status')).toContainText('disabled for predictions');
  await page.keyboard.press('Escape');
  await expect(page.locator('#prediction-status')).toContainText('No active corpus');
  await editor.fill('wo');
  await page.keyboard.press('End');
  await expect(page.locator('.cm-ghost')).toHaveCount(0);
  await closeApplication();
  await launchApplication();
  await expect(page.getByLabel('Predict from')).toHaveValue('combined');
  await expect(page.locator('#maximum-n')).toHaveValue('1');
  await expect(page.locator('#prediction-status')).toContainText('No active corpus');
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Use predictions.txt for predictions', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Use predictions.txt for predictions', exact: true }).check();
  await expect(page.locator('#sources-status')).toContainText('enabled for predictions');
  await page.keyboard.press('Escape');
  await expect(page.locator('#prediction-status')).toContainText('1 active imported source');
  // With N=1 only, the corpus frequency winner is "we", not the contextual "words".
  await page.getByRole('textbox', { name: 'Document text' }).fill('we write ');
  await page.keyboard.press('End');
  await expect(page.locator('.cm-ghost')).toHaveText('we');
  await configure({maxN:3});
  await page.getByRole('textbox', {name:'Document text'}).fill('we write wo'); await page.keyboard.press('End');
  await page.getByRole('textbox', { name: 'Document text' }).focus();
  await expect(page.locator('.cm-ghost')).toHaveText('rds');
});

test('keeps editing responsive and suggestions suspended across overlapping preference/import replies', async () => {
  await application.evaluate(({ ipcMain, dialog }) => {
    ipcMain.removeHandler('prediction:configure');
    ipcMain.handle('prediction:configure', (_event, settings) => new Promise((resolve) => {
      (globalThis as unknown as { finishSettings: () => void }).finishSettings = () => resolve({ ok: true, value: settings });
    }));
    dialog.showOpenDialog = () => new Promise((resolve) => {
      (globalThis as unknown as { finishPicker: () => void }).finishPicker = () => resolve({ canceled: true, filePaths: [] });
    });
  });
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Predict from').selectOption('imported');
  await page.keyboard.press('Escape');
  await expect.poll(() => application.evaluate(() => typeof (globalThis as unknown as { finishSettings: unknown }).finishSettings)).toBe('function');
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: 'Import TXT / MD', exact: true }).click();
  await expect.poll(() => application.evaluate(() => typeof (globalThis as unknown as { finishPicker: unknown }).finishPicker)).toBe('function');
  await expect(page.locator('#sources-status')).toHaveText('Working with local sources…');
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Document text' }).fill('wo');
  await page.keyboard.press('End');
  await application.evaluate(() => (globalThis as unknown as { finishSettings: () => void }).finishSettings());
  await expect(page.getByLabel('Predict from')).toHaveValue('imported');
  await expect(page.getByLabel('Predict from')).toBeDisabled();
  await expect(page.locator('#prediction-status')).toContainText('You can keep writing');
  await expect(page.locator('.cm-ghost')).toHaveCount(0);
  await expect(page.locator('.cm-line')).toHaveText('wo');
  await application.evaluate(() => (globalThis as unknown as { finishPicker: () => void }).finishPicker());
  await expect(page.getByLabel('Predict from')).toBeEnabled();
  await expect(page.locator('.cm-ghost')).toHaveText('rds');
  // Restore real production IPC after the controlled delayed-handler fixture.
  await closeApplication();
  await launchApplication();
});

test('drops delayed IPC after newer edits, cursor movement, source/N changes and composition', async () => {
  type Pending = { input: { prefix: string }; resolve: (result: unknown) => void };
  await application.evaluate(({ ipcMain }) => {
    const pending: Pending[] = [];
    (globalThis as unknown as { predictionPending: Pending[] }).predictionPending = pending;
    ipcMain.removeHandler('prediction:query');
    ipcMain.handle('prediction:query', (_event, input) => new Promise((resolve) => pending.push({ input, resolve })));
  });
  const editor = page.getByRole('textbox', { name: 'Document text' });
  const ghost = page.locator('.cm-ghost');
  const count = () => application.evaluate(() => (globalThis as unknown as { predictionPending: Pending[] }).predictionPending.length);
  async function release(index: number, word = 'words'): Promise<void> {
    await application.evaluate((_electron, { index, word }) => {
      (globalThis as unknown as { predictionPending: Pending[] }).predictionPending[index]!.resolve({ ok: true,
        value: { candidates: [{ word, display: word, frequency: 1 }], words: [{word,display:word,frequency:1}], indexRevision: 1 } });
    }, { index, word });
    // Allow the real asynchronous IPC reply and two renderer turns to run.
    await page.waitForTimeout(120);
  }
  let before = await count();
  await editor.fill('wo');
  await page.keyboard.press('End');
  await expect.poll(count).toBeGreaterThan(before);
  const old = (await count()) - 1;
  await page.keyboard.type('r');
  await expect.poll(count).toBeGreaterThan(old + 1);
  const newer = (await count()) - 1;
  await release(newer, 'work');
  await expect(ghost).toHaveText('k');
  await release(old, 'world');
  await expect(ghost).toHaveText('k');

  before = await count();
  await editor.fill('wo');
  await page.keyboard.press('End');
  await expect.poll(count).toBeGreaterThan(before);
  const moved = (await count()) - 1;
  await page.keyboard.press('ArrowLeft');
  await release(moved);
  await expect(ghost).toHaveCount(0);

  before = await count();
  await page.keyboard.press('End');
  await expect.poll(count).toBeGreaterThan(before);
  const changedSettings = (await count()) - 1;
  await configure({maxN:2});
  await release(changedSettings);
  await expect(ghost).toHaveCount(0);
  await editor.focus(); await page.keyboard.press('End');
  await expect.poll(count).toBeGreaterThan(changedSettings + 1);
  const changedSource = (await count()) - 1;
  await configure({sourceMode:'personal'});
  await release(changedSource);
  await expect(ghost).toHaveCount(0);
  await configure({sourceMode:'imported'});
  await editor.focus(); await page.keyboard.press('End');
  await expect.poll(count).toBeGreaterThan(changedSource + 1);
  const composing = (await count()) - 1;
  await editor.dispatchEvent('compositionstart', { data: '' });
  await release(composing);
  await expect(ghost).toHaveCount(0);
  await editor.dispatchEvent('keydown', { key: 'Tab', code: 'Tab', isComposing: true });
  await expect(editor.locator('.cm-line')).toHaveText('wo');
  await editor.dispatchEvent('compositionend', { data: '' });
  await expect.poll(count).toBeGreaterThan(composing + 1);
  const afterComposition = (await count()) - 1;
  await release(afterComposition);
  await expect(ghost).toHaveText('rds');
  await page.keyboard.press('Escape');
  await expect(ghost).toHaveCount(0);
  before = await count();
  await editor.fill('wor');
  await page.keyboard.press('End');
  await expect.poll(count).toBeGreaterThan(before);
  const pendingDismiss = (await count()) - 1;
  await page.keyboard.press('Escape');
  await release(pendingDismiss);
  await expect(ghost).toHaveCount(0);
  before = await count();
  await editor.fill('wo');
  await page.keyboard.press('End');
  await expect.poll(count).toBeGreaterThan(before);
  await application.evaluate(() => {
    (globalThis as unknown as { predictionPending: Pending[] }).predictionPending.at(-1)!.resolve({ ok: false, error: 'Fixture failure' });
  });
  await expect(page.locator('#prediction-status')).toContainText('Suggestions unavailable');
  before = await count();
  await page.keyboard.type('r');
  await expect.poll(count).toBeGreaterThan(before);
  await release((await count()) - 1, 'work');
  await expect(ghost).toHaveText('k');
  await expect(page.locator('#prediction-status')).toContainText('1 active imported source');
  expect(pageErrors).toEqual([]);
});

test('saves personal notes separately from consent, replaces learning, and preserves editing/history', async () => {
  await closeApplication(); await launchApplication(); // Restore production handlers after delayed IPC fixtures.
  const editor = page.getByRole('textbox', { name: 'Document text' });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.getByLabel('Name', { exact: true }).fill('Personal first');
  await editor.fill('private alpha'); await page.keyboard.press('End');
  await expect(page.locator('#session-note')).toContainText('Unsaved changes');
  expect(await page.evaluate(async () => (await window.typeNudge.listDocuments()))).toMatchObject({ ok: true, value: { learning: false, documents: [] } });
  await page.keyboard.press(`${modifier}+s`);
  await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByLabel('Learn from my writing', { exact: true })).not.toBeChecked();
  await expect(page.locator('#documents-list')).toContainText('Not learned');
  await page.getByLabel('Learn from my writing', { exact: true }).check();
  await expect(page.locator('#documents-status')).toContainText('future explicit saves');
  await expect(page.locator('#documents-list')).toContainText('Not learned');
  await page.keyboard.press('Escape'); await editor.focus(); await page.keyboard.press('End');
  await page.keyboard.press(`${modifier}+s`);
  await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  const inspect = () => {
    const db = new Database(path.join(userData, 'typenudge.sqlite3'), { readonly: true });
    try { return db.prepare("SELECT next_token, frequency FROM ngrams g JOIN sources s ON s.id = g.source_id WHERE s.kind = 'personal' AND n = 1 ORDER BY next_token").all(); }
    finally { db.close(); }
  };
  expect(inspect()).toEqual([{ next_token: 'alpha', frequency: 1 }, { next_token: 'private', frequency: 1 }]);
  await page.keyboard.press(`${modifier}+s`);
  await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  expect(inspect()).toEqual([{ next_token: 'alpha', frequency: 1 }, { next_token: 'private', frequency: 1 }]);
  await editor.fill('private beta'); await page.keyboard.press('End'); await page.keyboard.press(`${modifier}+s`);
  await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  expect(inspect()).toEqual([{ next_token: 'beta', frequency: 1 }, { next_token: 'private', frequency: 1 }]);
  await configure({sourceMode:'personal'});
  await editor.fill('pri'); await page.keyboard.press('End'); await expect(page.locator('.cm-ghost')).toHaveText('vate');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Use Personal first for predictions', exact: true }).uncheck();
  await expect(page.locator('#documents-status')).toContainText('source updated');
  await page.keyboard.press('Escape'); await editor.focus(); await page.keyboard.press('End'); await expect(page.locator('.cm-ghost')).toHaveCount(0);
  await expect(page.locator('#prediction-status')).toContainText('My Writing has no active');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Use Personal first for predictions', exact: true }).check();
  await page.getByRole('button', { name: 'Remove learning Personal first', exact: true }).click();
  await page.locator('#confirm-action').click();
  await expect(page.locator('#documents-status')).toContainText('saved text kept');
  await page.keyboard.press('Escape'); await editor.focus(); await page.keyboard.press('End'); await expect(page.locator('.cm-ghost')).toHaveCount(0);
  expect(inspect()).toEqual([]);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(editor.locator('.cm-line')).toHaveText('pri');
  await page.getByRole('button', { name: 'New', exact: true }).click(); await page.locator('#confirm-action').click();
  await expect(page.locator('#session-note')).toContainText('New document');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Open Personal first', exact: true }).click();
  await expect(editor.locator('.cm-line')).toHaveText('private beta');
  await page.keyboard.press(`${modifier}+z`); // Undo history from another document was cleared.
  await expect(editor.locator('.cm-line')).toHaveText('private beta');
  await page.keyboard.press(`${modifier}+s`); await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByLabel('Learn from my writing', { exact: true }).uncheck();
  await expect(page.locator('#documents-status')).toContainText('predictions paused');
  await page.keyboard.press('Escape'); await editor.fill('private gamma'); await page.keyboard.press('End');
  await page.keyboard.press(`${modifier}+s`); await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  expect(inspect()).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('resets personal learning without deleting notes/imports, reopens after restart, and guards window close', async () => {
  const editor = page.getByRole('textbox', { name: 'Document text' });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Personal second'); await editor.fill('resettable note');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByLabel('Learn from my writing', { exact: true }).check(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#session-note')).toHaveText('Saved on this device.');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.locator('#documents-list')).toContainText('2 learned words');
  await page.getByRole('button', { name: 'Reset personal learned data', exact: true }).click();
  await page.locator('#confirm-action').click();
  await expect(page.locator('#documents-status')).toContainText('documents and imports kept');
  await expect(page.getByLabel('Learn from my writing', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('list', { name: 'Saved documents' }).getByRole('listitem')).toHaveCount(2);
  const db = new Database(path.join(userData, 'typenudge.sqlite3'), { readonly: true });
  try {
    expect(db.prepare("SELECT COUNT(*) AS count FROM ngrams g JOIN sources s ON s.id = g.source_id WHERE s.kind = 'personal'").get()).toEqual({ count: 0 });
    expect((db.prepare("SELECT COUNT(*) AS count FROM ngrams g JOIN sources s ON s.id = g.source_id WHERE s.kind = 'imported'").get() as { count: number }).count).toBeGreaterThan(0);
  } finally { db.close(); }
  await page.screenshot({ path: test.info().outputPath('personal-documents.png') });
  await closeApplication(); await launchApplication();
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByLabel('Learn from my writing', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('list', { name: 'Saved documents' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Open Personal second', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document text' }).locator('.cm-line')).toHaveText('resettable note');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Personal second', exact: true }).click(); await page.locator('#confirm-action').click();
  await expect(page.getByRole('list', { name: 'Saved documents' }).getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('Escape'); await page.getByRole('textbox', { name: 'Document text' }).fill('unsaved close guard');
  await application.evaluate(({ dialog, BrowserWindow }) => {
    (globalThis as unknown as { closePrompted: boolean }).closePrompted = false;
    dialog.showMessageBoxSync = () => { (globalThis as unknown as { closePrompted: boolean }).closePrompted = true; return 1; };
    BrowserWindow.getAllWindows()[0]!.close();
  });
  await expect.poll(() => application.evaluate(() => (globalThis as unknown as { closePrompted: boolean }).closePrompted)).toBe(true);
  expect(application.windows()).toHaveLength(1);
  await expect(page.locator('.cm-line')).toHaveText('unsaved close guard');
  expect(pageErrors).toEqual([]);
});

test('preserves edits made during a pending save or open, and retains dirty text on save failure', async () => {
  await closeApplication(); await launchApplication();
  const stored = await page.evaluate(async () => {
    const state = await window.typeNudge.listDocuments();
    if (!state.ok || !state.value.documents[0]) throw new Error('Missing fixture');
    const doc = await window.typeNudge.openDocument(state.value.documents[0].id);
    if (!doc.ok) throw new Error(doc.error);
    return doc.value;
  });
  await application.evaluate(({ ipcMain }, saved) => {
    const fixture = globalThis as unknown as { finishSave: () => void; finishOpen: () => void };
    ipcMain.removeHandler('documents:save');
    ipcMain.handle('documents:save', (_event, input) => new Promise((resolve) => {
      fixture.finishSave = () => resolve({ ok: true, value: { ...saved, name: input.name } });
    }));
    ipcMain.removeHandler('documents:open');
    ipcMain.handle('documents:open', () => new Promise((resolve) => { fixture.finishOpen = () => resolve({ ok: true, value: saved }); }));
  }, stored);
  const editor = page.getByRole('textbox', { name: 'Document text' });
  await page.getByLabel('Name', { exact: true }).fill('Snapshot'); await editor.fill('before save');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => application.evaluate(() => typeof (globalThis as unknown as { finishSave: unknown }).finishSave)).toBe('function');
  await editor.fill('typed while saving');
  await application.evaluate(() => (globalThis as unknown as { finishSave: () => void }).finishSave());
  await expect(page.locator('#session-note')).toContainText('Unsaved changes');
  await expect(editor.locator('.cm-line')).toHaveText('typed while saving');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: `Open ${stored.name}`, exact: true }).click();
  await page.locator('#confirm-action').click();
  await expect.poll(() => application.evaluate(() => typeof (globalThis as unknown as { finishOpen: unknown }).finishOpen)).toBe('function');
  await page.keyboard.press('Escape'); await editor.fill('typed while opening');
  await application.evaluate(() => (globalThis as unknown as { finishOpen: () => void }).finishOpen());
  await expect(page.locator('#documents-status')).toContainText('Opening canceled because you edited');
  await expect(editor.locator('.cm-line')).toHaveText('typed while opening');
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('documents:save');
    ipcMain.handle('documents:save', () => ({ ok: false, error: 'Fixture save failed' }));
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#documents-status')).toHaveText('Fixture save failed');
  await expect(page.locator('#document-error')).toBeVisible();
  await expect(page.locator('#document-error')).toHaveText('Fixture save failed');
  await expect(page.locator('#session-note')).toContainText('Unsaved changes');
  await expect(editor.locator('.cm-line')).toHaveText('typed while opening');
  expect(pageErrors).toEqual([]);
});
