// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { StorageClient } from '../../src/main/storage/client';
const output=path.resolve('.cache',`test-worker-${process.pid}`);
beforeAll(async()=>{
  await build({configFile:false,logLevel:'silent',build:{outDir:output,emptyOutDir:true,
    lib:{entry:path.resolve('src/main/storage/worker.ts'),formats:['cjs'],fileName:()=> 'worker.cjs'},
    rollupOptions:{external:(id)=>id.startsWith('node:')||id==='better-sqlite3'}}});
});
afterAll(async()=>{await rm(output,{recursive:true,force:true});});
it('keeps main responsive, exposes progress, and rolls back an interrupted large replacement',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'typenudge-worker-')),filename=path.join(dir,'data.sqlite3'),input=path.join(dir,'selected.txt');
  const workerPath=path.join(output,'worker.cjs');let client=new StorageClient(filename,workerPath);
  try {
    await writeFile(input,'original words');expect(await client.store.importFiles([input])).toMatchObject({imported:1});
    const before=await client.store.list();
    expect(await client.store.storageUsage()).toMatchObject({databaseBytes:expect.any(Number),walBytes:expect.any(Number),totalBytes:expect.any(Number)});
    const settings=await client.store.getPredictionSettings();
    await client.store.setPredictionSettings({...settings,ngramScales:[1,2,3,4,5,6,100]});
    await writeFile(input,'word '.repeat(500_000));
    const pending=Promise.resolve(client.store.importFiles([input])).catch(error=>error.message);
    let ticks=0;const heartbeat=setInterval(()=>ticks++,5);
    try {await vi.waitFor(()=>expect(client.store.progress?.().words).toBeGreaterThan(8192),{timeout:10_000,interval:10});}
    finally {clearInterval(heartbeat);}
    expect(ticks).toBeGreaterThan(1);
    const inspection=new Database(filename,{readonly:true});
    expect(inspection.prepare('SELECT body_text FROM documents').get()).toEqual({body_text:'original words'});inspection.close();
    await client.close();expect(await pending).toContain('Local storage stopped');
    client=new StorageClient(filename,workerPath);
    expect(await client.store.list()).toEqual(before);
    expect((await client.store.getPredictionSettings()).ngramScales).toEqual([1,2,3,4,5,6,100]);
    const db=new Database(filename,{readonly:true});expect(db.pragma('integrity_check',{simple:true})).toBe('ok');db.close();
    expect(await client.store.importFiles([input])).toMatchObject({imported:1,errors:[]});
    expect((await client.store.list())[0]).toMatchObject({tokenCount:500_000,indexMaxN:7,revision:2});
    const result=await client.store.predict({prefix:'wo',context:Array(6).fill('word')});
    expect(result.words).toHaveLength(3);expect(result.candidates[0]?.word).toBe('word');
  } finally {await client.close();await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
},30_000);
