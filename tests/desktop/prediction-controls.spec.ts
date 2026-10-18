// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

test('uses settings/help, real combined pools and stable multi-word acceptance with isolated undo', async () => {
  const profile=await mkdtemp(path.join(tmpdir(),'typenudge-controls-'));
  let app:ElectronApplication|undefined;
  try {
    const files=[path.join(profile,'first.txt'),path.join(profile,'second.md')];
    await writeFile(files[0]!, 'zero alpha beta gamma delta epsilon zeta eta.\n'.repeat(7));
    await writeFile(files[1]!, 'zero alpha beta gamma delta epsilon zeta eta.\n'.repeat(4));
    const executablePath=process.env.TYPENUDGE_EXECUTABLE;
    const env=Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined&&e[0].toUpperCase()!=='ELECTRON_RUN_AS_NODE'));
    app=await _electron.launch({executablePath,args:[...(executablePath?[]:['.']),`--user-data-dir=${profile}`],chromiumSandbox:true,env});
    const page=await app.firstWindow(); const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await expect(page.locator('#settings-dialog')).not.toBeVisible();
    await expect(page.locator('#help-dialog')).not.toBeVisible();
    await expect(page.locator('#about-button')).toBeEnabled();
    await page.getByRole('button',{name:'Help and shortcuts',exact:true}).click();
    await expect(page.locator('#help-dialog')).toContainText('Alt + Right');
    await expect(page.locator('#help-dialog')).toContainText('Alt + Enter');
    await page.keyboard.press('Escape');await expect(page.locator('#help-button')).toBeFocused();
    await page.locator('#settings-button').click();
    await expect(page.locator('#maximum-n')).toHaveValue('3');
    await expect(page.locator('#pool-size')).toHaveValue('10');
    await expect(page.locator('#preview-words')).toHaveValue('3');
    const wideLayout=await page.locator('#settings-dialog').evaluate(dialog=>{
      const options=dialog.querySelector('.prediction-options')!.getBoundingClientRect();
      const scales=dialog.querySelector('.ngram-scales')!.getBoundingClientRect();
      return {width:dialog.getBoundingClientRect().width,parallel:scales.left>=options.right,topGap:Math.abs(scales.top-options.top)};
    });
    expect(wideLayout.width).toBeGreaterThan(700);expect(wideLayout.parallel).toBe(true);expect(wideLayout.topGap).toBeLessThan(16);
    await expect(page.locator('#ngram-scale-value-7')).toBeInViewport();
    await expect(page.locator('#settings-dialog').getByRole('button',{name:'Close',exact:true})).toBeInViewport();
    await page.screenshot({path:test.info().outputPath('settings-wide.png')});
    for(const [id,value] of [['maximum-n','7'],['pool-size','1']] as const){
      await expect(page.locator('#'+id)).toBeEnabled();
      await page.locator('#'+id).evaluate((el,value)=>{(el as HTMLInputElement).value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},value);
      await expect(page.locator('#'+id)).toBeEnabled();
    }
    await expect(page.locator('#maximum-n-value')).toHaveText('N=1–7');
    await page.keyboard.press('Escape');await expect(page.locator('#settings-button')).toBeFocused();
    await app.evaluate(({dialog},selected)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:selected});},files);
    await page.locator('#sources-button').click();await page.locator('#import-button').click();
    await expect(page.locator('#sources-status')).toHaveText('2 imported · 0 unchanged');
    await expect(page.locator('#sources-list')).toContainText('N=1–7 ready');
    await page.keyboard.press('Escape');
    const editor=page.getByRole('textbox',{name:'Document text'}),ghost=page.locator('.cm-ghost');
    await editor.fill('zero\u2028al');await page.keyboard.press('End');await expect(ghost).toHaveText('pha alpha alpha');
    await editor.fill('zero al');await page.keyboard.press('End');await expect(ghost).toHaveText('pha beta gamma');
    const combined=await page.evaluate(async()=>window.typeNudge.predict({prefix:'al',context:['zero']}));
    expect(combined).toMatchObject({ok:true,value:{candidates:[{word:'alpha',frequency:22}],words:[{word:'alpha'},{word:'beta'},{word:'gamma'}]}});
    await page.waitForTimeout(150);await expect(ghost).toHaveText('pha beta gamma');
    const db=new Database(path.join(profile,'typenudge.sqlite3'),{readonly:true});
    const before=db.prepare('SELECT SUM(frequency) AS total FROM ngrams').get();
    const modifier=process.platform==='darwin'?'Meta':'Control';
    await page.keyboard.press('Tab');await expect(editor.locator('.cm-line')).toHaveText('zero alpha beta gamma');
    // Ghost is a widget in the line; actual document and clipboard contain only accepted text.
    await page.keyboard.press(`${modifier}+a`);await page.keyboard.press(`${modifier}+c`);
    expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('zero alpha');
    await page.keyboard.press('ArrowRight');
    // A selection change intentionally invalidates the remaining preview; recreate it for acceptance checks.
    await editor.fill('zero al');await page.keyboard.press('End');await expect(ghost).toHaveText('pha beta gamma');
    await page.keyboard.press('Tab');await expect(ghost).toHaveText(' beta gamma');
    await page.keyboard.press('Alt+ArrowRight');await expect(ghost).toHaveCount(0);
    await expect(editor.locator('.cm-line')).toHaveText('zero alpha beta gamma');
    await page.keyboard.press(`${modifier}+z`);await expect(editor.locator('.cm-line')).toHaveText('zero alpha');
    await page.keyboard.press(`${modifier}+z`);await expect(editor.locator('.cm-line')).toContainText('zero al');
    await page.locator('#settings-button').click();
    await page.locator('#preview-words').evaluate(el=>{(el as HTMLInputElement).value='4';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await expect(page.locator('#preview-words')).toBeEnabled();await page.keyboard.press('Escape');
    await editor.fill('zero al');await page.keyboard.press('End');await expect(ghost).toHaveText('pha beta gamma delta');
    await page.keyboard.press('Alt+ArrowRight');await expect(ghost).toHaveText(' gamma delta');
    await page.keyboard.press('Alt+Enter');await expect(editor.locator('.cm-line')).toHaveText('zero alpha beta gamma delta');
    await page.keyboard.press(`${modifier}+z`);await expect(editor.locator('.cm-line')).toHaveText('zero alpha beta');
    await page.locator('#settings-button').click();
    await page.locator('#preview-words').evaluate(el=>{(el as HTMLInputElement).value='3';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await expect(page.locator('#preview-words')).toBeEnabled();await page.keyboard.press('Escape');
    await editor.fill('zero al');await page.keyboard.press('End');await expect(ghost).toHaveText('pha beta gamma');
    await page.keyboard.press('Alt+Enter');await expect(editor.locator('.cm-line')).toHaveText('zero alpha beta gamma');
    await page.keyboard.press(`${modifier}+z`);await expect(editor.locator('.cm-line')).toContainText('zero al');
    await editor.fill('zero al');await page.keyboard.press('End');await expect(ghost).toHaveText('pha beta gamma');
    await page.keyboard.press('Alt+ArrowDown');await expect(ghost).toHaveText('pha beta gamma'); // singleton, no retry loop
    await page.keyboard.press('Escape');await expect(ghost).toHaveCount(0);
    expect(db.prepare('SELECT SUM(frequency) AS total FROM ngrams').get()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS count FROM personal_documents').get()).toEqual({count:0});db.close();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(800,760));
    await page.locator('#settings-button').click();
    expect(await page.locator('#settings-dialog').evaluate(dialog=>{
      const options=dialog.querySelector('.prediction-options')!.getBoundingClientRect();
      const scales=dialog.querySelector('.ngram-scales')!.getBoundingClientRect();
      return scales.left>=options.right&&dialog.scrollWidth<=dialog.clientWidth;
    })).toBe(true);
    await page.screenshot({path:test.info().outputPath('settings-800.png')});
    await page.keyboard.press('Escape');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(520,480));
    await page.locator('#settings-button').click();
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await expect(page.locator('#settings-title')).toBeInViewport();
    await expect(page.locator('#maximum-n')).toBeInViewport();
    expect(await page.locator('#settings-dialog').evaluate(dialog=>{
      const options=dialog.querySelector('.prediction-options')!.getBoundingClientRect();
      const scales=dialog.querySelector('.ngram-scales')!.getBoundingClientRect();
      return scales.top>=options.bottom;
    })).toBe(true);
    expect(await page.locator('#settings-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath('settings-520.png')});
    await page.locator('#preview-words').fill('1');await page.locator('#preview-words').dispatchEvent('change');
    await expect(page.locator('#accept-words')).toHaveValue('1');
    await expect(page.locator('#accept-words')).toHaveAttribute('max','1');
    await page.keyboard.press('Escape');
    await page.locator('#help-button').click();await expect(page.locator('#help-title')).toBeInViewport();await expect(page.locator('#help-dialog dt').first()).toBeInViewport();await page.screenshot({path:test.info().outputPath('help-520.png')});
    expect(await page.locator('#help-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  } finally {
    if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>0;});await app.close();}
    await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});

test('persists 0–250× sliders/manual values, changes only virtual scores and displays measured database usage', async () => {
  const profile=await mkdtemp(path.join(tmpdir(),'typenudge-scales-'));
  let app:ElectronApplication|undefined;
  let db:Database.Database|undefined;
  try {
    const selected=path.join(profile,'scaling.txt');
    await writeFile(selected,'a b c d e f rare.\n'+'common.\n'.repeat(20));
    const executablePath=process.env.TYPENUDGE_EXECUTABLE;
    const env=Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined&&e[0].toUpperCase()!=='ELECTRON_RUN_AS_NODE'));
    const launch=()=>_electron.launch({executablePath,args:[...(executablePath?[]:['.']),`--user-data-dir=${profile}`],chromiumSandbox:true,env});
    app=await launch();let page=await app.firstWindow();
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await expect(page.locator('#about-button')).toBeEnabled();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},selected);
    await page.locator('#sources-button').click();await page.locator('#import-button').click();
    await expect(page.locator('#sources-status')).toHaveText('1 imported · 0 unchanged');await page.keyboard.press('Escape');
    db=new Database(path.join(profile,'typenudge.sqlite3'),{readonly:true});
    const rows=db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all();
    const sources=db.prepare('SELECT * FROM sources').all();
    const revision=db.prepare("SELECT value FROM settings WHERE key='indexRevision'").get();
    await page.locator('#settings-button').click();
    for(let n=1;n<=7;n++) {
      await expect(page.locator(`#ngram-scale-${n}`)).toHaveValue('1');
      await expect(page.locator(`#ngram-scale-value-${n}`)).toHaveValue('1');
      await expect(page.locator(`#ngram-scale-${n}`)).toHaveAttribute('min','0');
      await expect(page.locator(`#ngram-scale-${n}`)).toHaveAttribute('max','250');
    }
    for(const [id,value] of [['maximum-n','7'],['pool-size','1'],['preview-words','1']] as const) {
      await expect(page.locator('#'+id)).toBeEnabled();
      await page.locator('#'+id).evaluate((el,value)=>{(el as HTMLInputElement).value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},value);
      await expect(page.locator('#'+id)).toBeEnabled();
    }
    const predict=()=>page.evaluate(()=>window.typeNudge.predict({prefix:'',context:['a','b','c','d','e','f']}));
    expect(await predict()).toMatchObject({ok:true,value:{candidates:[{word:'common',frequency:20}]}});
    const slider=page.getByRole('slider',{name:'N=7 multiplier',exact:true});
    const number=page.getByRole('spinbutton',{name:'N=7 multiplier value',exact:true});
    await slider.focus();await page.keyboard.press('End');await expect(slider).toBeEnabled();
    await expect(slider).toHaveValue('250');await expect(number).toHaveValue('250');
    expect(await predict()).toMatchObject({ok:true,value:{candidates:[{word:'rare',frequency:255}]}});
    for(const invalid of ['-1','251','1.5','']) {
      await number.fill(invalid);await number.dispatchEvent('change');
      expect(await number.evaluate(el=>(el as HTMLInputElement).checkValidity())).toBe(false);
      expect(await page.evaluate(()=>window.typeNudge.getPredictionSettings())).toMatchObject({ok:true,value:{ngramScales:[1,1,1,1,1,1,250]}});
    }
    await number.fill('42');await number.press('Tab');await expect(number).toBeEnabled();
    await expect(slider).toHaveValue('42');
    expect(await predict()).toMatchObject({ok:true,value:{candidates:[{word:'rare',frequency:47}]}});
    await slider.focus();await page.keyboard.press('Home');await expect(slider).toBeEnabled();
    await expect(slider).toHaveValue('0');await expect(number).toHaveValue('0');
    expect(await predict()).toMatchObject({ok:true,value:{candidates:[{word:'common',frequency:20}]}});
    await page.locator('#refresh-storage').click();
    await expect(page.locator('#storage-usage')).toContainText('Database storage:');
    await expect(page.locator('#refresh-storage')).toBeEnabled();
    const usage=await page.evaluate(()=>window.typeNudge.getStorageUsage());
    const [database,wal,shm]=await Promise.all(['','-wal','-shm'].map(suffix=>stat(path.join(profile,'typenudge.sqlite3')+suffix)));
    expect(usage).toEqual({ok:true,value:{databaseBytes:database!.size,walBytes:wal!.size,shmBytes:shm!.size,totalBytes:database!.size+wal!.size+shm!.size}});
    await expect(page.locator('#storage-usage')).toHaveAttribute('title',/bytes total/);
    for(let n=1;n<=7;n++) {
      const input=page.locator(`#ngram-scale-value-${n}`);
      await input.evaluate(el=>{(el as HTMLInputElement).value='0';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
      await expect(input).toBeEnabled();
    }
    expect(await predict()).toMatchObject({ok:true,value:{candidates:[],words:[]}});
    expect(db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all()).toEqual(rows);
    expect(db.prepare('SELECT * FROM sources').all()).toEqual(sources);
    expect(db.prepare("SELECT value FROM settings WHERE key='indexRevision'").get()).toEqual(revision);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setSize(520,480));
    await number.scrollIntoViewIfNeeded();
    expect(await page.locator('#settings-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath('ngram-scales-520.png')});
    await page.keyboard.press('Escape');db.close();db=undefined;
    await app.close();app=await launch();page=await app.firstWindow();
    await expect(page.locator('#about-button')).toBeEnabled();await page.locator('#settings-button').click();
    for(let n=1;n<=7;n++) await expect(page.locator(`#ngram-scale-value-${n}`)).toHaveValue('0');
    expect(await predict()).toMatchObject({ok:true,value:{candidates:[],words:[]}});
    await page.locator('#ngram-scale-value-7').fill('42');await page.locator('#ngram-scale-value-7').press('Tab');
    await expect(page.locator('#ngram-scale-value-7')).toBeEnabled();
    expect(await predict()).toMatchObject({ok:true,value:{candidates:[{word:'rare',frequency:42}]}});
    expect(errors).toEqual([]);
  } finally {
    db?.close();
    if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>0;});await app.close();}
    await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
