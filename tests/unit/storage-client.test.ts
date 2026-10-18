// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from 'vitest';
import { StorageClient } from '../../src/main/storage/client';
const mocks=vi.hoisted(()=>({workers:[] as {emit:(event:string,value?:unknown)=>void;postMessage:ReturnType<typeof vi.fn>;terminate:ReturnType<typeof vi.fn>}[]}));
vi.mock('node:worker_threads',async()=>{
  const {EventEmitter}=await import('node:events');
  return {Worker:class extends EventEmitter {postMessage=vi.fn();terminate=vi.fn(async()=>0);constructor(){super();mocks.workers.push(this);}}};
});
beforeEach(()=>{mocks.workers.length=0;});
it('serializes background operations and coalesces obsolete queued predictions',async()=>{
  const client=new StorageClient('local.sqlite3','worker.js'),worker=mocks.workers[0]!;
  const first=client.store.list();
  const old=client.store.predict({prefix:'o',context:[]});const oldError=Promise.resolve(old).catch(e=>e.message);
  const newest=client.store.predict({prefix:'n',context:[]});
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(await oldError).toContain('superseded');
  worker.emit('message',{id:1,value:[]});await expect(first).resolves.toEqual([]);
  expect(worker.postMessage).toHaveBeenLastCalledWith({id:1,method:'predict',args:[{prefix:'n',context:[]}]});
  worker.emit('message',{id:1,value:{words:[]}});await expect(newest).resolves.toEqual({words:[]});await client.close();
});
it('serves bounded progress while a write is busy and fails all waiters if storage stops',async()=>{
  const client=new StorageClient('local.sqlite3','worker.js'),worker=mocks.workers[0]!;
  const first=Promise.resolve(client.store.reindex('id')).catch(e=>e.message);
  const next=Promise.resolve(client.store.list()).catch(e=>e.message);
  worker.emit('message',{progress:{words:4096,active:true}});
  expect(client.store.progress?.()).toEqual({words:4096,active:true});
  worker.emit('error',new Error('private-path'));
  expect(await first).toContain('Local storage stopped');expect(await next).toContain('Local storage stopped');
  expect(client.store.progress?.().active).toBe(false);
  await expect(client.store.list()).rejects.toThrow('unavailable');await client.close();
});
it('bounds non-prediction queue size and preserves actionable worker errors',async()=>{
  const client=new StorageClient('local.sqlite3','worker.js'),worker=mocks.workers[0]!;
  const pending=Array.from({length:33},()=>Promise.resolve(client.store.list()).catch(e=>e.message));
  await expect(client.store.list()).rejects.toThrow('busy');
  worker.emit('message',{id:1,error:'The selected file is too large.'});expect(await pending[0]).toBe('The selected file is too large.');
  await client.close();await Promise.all(pending);
});
