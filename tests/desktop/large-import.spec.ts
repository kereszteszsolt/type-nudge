// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance as nodePerformance } from 'node:perf_hooks';
import Database from 'better-sqlite3';

test('imports 500 KiB with form feeds, 500,000-word and 5 MiB sources and persists stable counts', async () => {
  test.setTimeout(240_000);
  const userData = await mkdtemp(path.join(tmpdir(), 'typenudge-large-import-'));
  const header = 'we write words.\n';
  const pageText = 'word '.repeat(1024).slice(0, -1);
  const inputs: { name: string; text: string; raw?: string; tokens: number; sentences: number }[] = [
    { name: 'dense-500k.txt', raw: (pageText + '\f').repeat(100), text: (pageText + '\n').repeat(100), tokens: 102_400, sentences: 100 },
    { name: 'bound-500k.txt', text: header + Array.from({ length: 499_997 }, (_, i) => `w${i.toString(36)}`).join(' '), tokens: 500_000, sentences: 2 },
    { name: 'bound-5m.md', text: header + ' '.repeat(5 * 1024 * 1024 - Buffer.byteLength(header)), tokens: 3, sentences: 1 },
  ];
  const files = inputs.map((input) => path.join(userData, input.name));
  let application: ElectronApplication | undefined;
  let page: Page;
  const environment = Object.fromEntries(Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[0].toUpperCase() !== 'ELECTRON_RUN_AS_NODE',
  ));
  async function launch(): Promise<void> {
    const executablePath = process.env.TYPENUDGE_EXECUTABLE;
    application = await _electron.launch({ executablePath,
      args: [...(executablePath ? [] : ['.']), `--user-data-dir=${userData}`], chromiumSandbox: true, env: environment });
    page = await application.firstWindow();
    await expect(page.getByRole('textbox', { name: 'Document text' })).toBeVisible();
  }
  async function close(): Promise<void> {
    if (!application) return;
    await application.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
    await application.close();
    application = undefined;
  }
  function inspect(): { name: string; tokens: number; revision: number; hash: string }[] {
    const db = new Database(path.join(userData, 'typenudge.sqlite3'), { readonly: true });
    try {
      const rows = db.prepare(`SELECT s.id, s.display_name AS name, s.token_count AS tokens, s.revision,
        s.content_hash AS hash, d.body_text AS text, d.byte_length AS bytes
        FROM sources s JOIN documents d ON d.source_id = s.id ORDER BY s.display_name`).all() as {
          id: string; name: string; tokens: number; revision: number; hash: string; text: string; bytes: number }[];
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        const input = inputs.find((item) => item.name === row.name)!;
        expect(row.tokens).toBe(input.tokens);
        expect(row.text).toBe(input.text);
        expect(row.bytes).toBe(Buffer.byteLength(input.text));
        expect(row.hash).toBe(createHash('sha256').update(input.text).digest('hex'));
        expect(db.prepare('SELECT n, SUM(frequency) AS total FROM ngrams WHERE source_id = ? GROUP BY n ORDER BY n').all(row.id))
          .toEqual(Array.from({length:Math.min(7,input.tokens)},(_,i)=>i+1).map((n) => ({ n, total: input.sentences===100 ? input.tokens-100*(n-1) : input.sentences===2 ? input.tokens-Math.min(n-1,3)-(n-1) : input.tokens-(n-1) })));
      }
      return rows.map(({ name, tokens, revision, hash }) => ({ name, tokens, revision, hash }));
    } finally { db.close(); }
  }

  try {
    await Promise.all(inputs.map((input, index) => writeFile(files[index]!, input.raw ?? input.text)));
    await launch();
    await application!.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected });
    }, files);
    await page!.getByRole('button', { name: 'Sources', exact: true }).click();
    await page!.evaluate(() => {
      const probe = { last: window.performance.now(), maxGapMs: 0, ticks: 0, id: 0 };
      probe.id = window.setInterval(() => {
        const now = window.performance.now(); probe.maxGapMs = Math.max(probe.maxGapMs, now - probe.last);
        probe.last = now; probe.ticks++;
      }, 50);
      (window as unknown as { importProbe: typeof probe }).importProbe = probe;
    });
    const start = nodePerformance.now();
    await page!.getByRole('button', { name: 'Import TXT / MD', exact: true }).click();
    await expect.poll(async()=>page!.evaluate(async()=>{
      const progress=await window.typeNudge.getIndexProgress();return progress.ok&&progress.value.active;
    }),{timeout:15_000}).toBe(true);
    await page!.keyboard.press('Escape');
    await page!.getByRole('textbox',{name:'Document text'}).fill('Writing while the index is building');
    await page!.keyboard.press('End');await page!.keyboard.type(' works.');
    await expect(page!.locator('.cm-line')).toHaveText('Writing while the index is building works.');
    expect((await page!.evaluate(()=>window.typeNudge.getAppInfo())).name).toBe('TypeNudge');
    await page!.getByRole('button',{name:'Sources',exact:true}).click();
    await expect(page!.locator('#sources-status')).toHaveText('3 imported · 0 unchanged', { timeout: 90_000 });
    const importMs = nodePerformance.now() - start;
    const heartbeat = await page!.evaluate(() => {
      const probe = (window as unknown as { importProbe: { maxGapMs: number; ticks: number; id: number } }).importProbe;
      window.clearInterval(probe.id);
      return { maxGapMs: probe.maxGapMs, ticks: probe.ticks };
    });
    const mainMemory = await application!.evaluate(() => ({ rssMiB: process.memoryUsage().rss / 1024 ** 2,
      peakRssMiB: process.resourceUsage().maxRSS / 1024 }));
    const before = inspect();
    await page!.screenshot({ path: test.info().outputPath('large-sources.png') });
    await test.info().attach('large-import-metrics', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      inputs: inputs.map(({ name, text, tokens }) => ({ name, tokens, utf8Bytes: Buffer.byteLength(text) })),
      importMs, heartbeat, mainMemory,
    }, null, 2)) });
    console.log(JSON.stringify({ largeImport: { importMs, heartbeat, mainMemory } }));

    await page!.getByRole('button', { name: 'Import TXT / MD', exact: true }).click();
    await expect(page!.locator('#sources-status')).toHaveText('0 imported · 3 unchanged', { timeout: 90_000 });
    expect(inspect()).toEqual(before);
    await page!.getByRole('button', { name: 'Reindex bound-500k.txt', exact: true }).click();
    await expect(page!.getByRole('listitem').filter({ hasText: 'bound-500k.txt' })).toContainText('Revision 2', { timeout: 90_000 });
    const reindexed = inspect();
    expect(reindexed).toEqual(before.map((row) => ({ ...row, revision: row.name === 'bound-500k.txt' ? 2 : 1 })));
    await page!.keyboard.press('Escape');
    const preferences = await page!.evaluate(async()=>{ const r=await window.typeNudge.getPredictionSettings(); if(!r.ok)throw new Error(r.error); return window.typeNudge.setPredictionSettings({...r.value,poolSize:1,previewWords:1,acceptWords:1}); });
    expect(preferences.ok).toBe(true);
    // Discard this fixture's deliberate unsaved typing before reloading preferences.
    await application!.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>0;});
    await page!.reload();
    await expect(page!.getByRole('button',{name:'About',exact:true})).toBeEnabled();
    await page!.getByRole('textbox', { name: 'Document text' }).fill('we write wo');
    await page!.keyboard.press('End');
    await expect(page!.locator('.cm-ghost')).toHaveText('rd');
    await close();
    await launch();
    await page!.getByRole('button', { name: 'Sources', exact: true }).click();
    await expect(page!.getByRole('list', { name: 'Imported sources' }).getByRole('listitem')).toHaveCount(3);
    expect(inspect()).toEqual(reindexed);
    for (let index = 0; index < files.length; index++) expect(await readFile(files[index]!, 'utf8')).toBe(inputs[index]!.raw ?? inputs[index]!.text);
  } finally {
    await close();
    await rm(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
