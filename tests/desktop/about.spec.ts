// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import metadata from '../../brand/branding.json';

test('About preserves the editor and exposes accessible metadata, attribution and allowlisted links', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'typenudge-about-'));
  const executablePath = process.env.TYPENUDGE_EXECUTABLE;
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0].toUpperCase() !== 'ELECTRON_RUN_AS_NODE'));
  const app = await _electron.launch({ executablePath, args: [...(executablePath ? [] : ['.']), `--user-data-dir=${userData}`], chromiumSandbox: true, env });
  try {
    const page = await app.firstWindow(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const editor = page.getByRole('textbox', { name: 'Document text' });
    await expect(editor).toBeVisible(); await editor.fill('Keep this unsaved text.');
    const about = page.getByRole('button', { name: 'About', exact: true });
    await expect(about).toBeEnabled(); await about.click();
    const dialog = page.getByRole('dialog', { name: `About ${metadata.appName}` });
    await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Close about' })).toBeFocused();
    await expect(dialog).toContainText(metadata.appDescription); await expect(dialog.getByRole('note')).toContainText(metadata.supportRemarkText);
    await expect(dialog.locator('.copyright-line')).toHaveText(`© ${new Date().getFullYear()} ${metadata.authorName}, Apache-2.0`);
    const website = dialog.getByRole('button', { name: 'kereszteszsolt.hu', exact: true });
    await website.focus(); const tip = website.getByRole('tooltip');
    await expect(tip).toContainText('hu | en | ro | de'); await expect(tip).toContainText(metadata.authorWebsite);
    const bounds = await tip.boundingBox(); const viewport = await page.evaluate(() => innerWidth);
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport);
    await app.evaluate(({ shell }) => { (globalThis as unknown as { links: string[] }).links = []; shell.openExternal = async url => { (globalThis as unknown as { links: string[] }).links.push(url); }; });
    await dialog.getByRole('button', { name: 'Apache-2.0', exact: true }).click();
    expect(await app.evaluate(() => (globalThis as unknown as { links: string[] }).links)).toEqual(['https://www.apache.org/licenses/LICENSE-2.0']);
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(about).toBeFocused();
    await expect(editor).toHaveText('Keep this unsaved text.');
    await page.screenshot({ path: test.info().outputPath('editor-attribution.png') });
    await page.setViewportSize({ width: 480, height: 740 }); await about.click(); await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Ways to support', exact: true }).focus();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('about-narrow.png') });
    await dialog.getByRole('button', { name: 'Close about' }).click(); await expect(about).toBeFocused();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; }).catch(() => {});
    await app.close().catch(() => {}); await rm(userData, { recursive: true, force: true });
  }
});
