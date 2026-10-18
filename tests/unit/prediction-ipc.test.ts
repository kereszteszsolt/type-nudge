// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { registerPredictionIpc } from '../../src/main/prediction-ipc';
import { defaultPredictionSettings, predictionChannels as channels } from '../../src/shared/prediction';
import type { StoreAccess } from '../../src/main/storage/access';
const mocks=vi.hoisted(()=>({handlers:new Map<string,(event:IpcMainInvokeEvent,...args:unknown[])=>unknown>()}));
vi.mock('electron',()=>({ipcMain:{handle:(name:string,fn:(event:IpcMainInvokeEvent,...args:unknown[])=>unknown)=>mocks.handlers.set(name,fn)}}));
const entry='file:///app/index.html',frame={url:entry},contents={mainFrame:frame};
const window={isDestroyed:()=>false,webContents:contents} as unknown as BrowserWindow;
const event={sender:contents,senderFrame:frame} as unknown as IpcMainInvokeEvent;
const store={getPredictionSettings:vi.fn(),setPredictionSettings:vi.fn(),predict:vi.fn()};
const call=(channel:string,...args:unknown[])=>mocks.handlers.get(channel)!(event,...args);
beforeEach(()=>{
  vi.resetAllMocks();mocks.handlers.clear();store.getPredictionSettings.mockResolvedValue(defaultPredictionSettings);
  store.setPredictionSettings.mockImplementation(async(s)=>s);store.predict.mockResolvedValue({candidates:[],words:[],indexRevision:1});
  registerPredictionIpc(()=>window,entry,()=>store as unknown as StoreAccess);
});
it('exposes only named prediction/settings operations and awaits background storage',async()=>{
  expect([...mocks.handlers.keys()]).toEqual([channels.settings,channels.configure,channels.predict]);
  await expect(call(channels.settings)).resolves.toEqual({ok:true,value:defaultPredictionSettings});
  await expect(call(channels.predict,{prefix:'WO',context:['Write'],avoidWord:'World'})).resolves.toMatchObject({ok:true});
  expect(store.predict).toHaveBeenCalledExactlyOnceWith({prefix:'wo',context:['write'],avoidWord:'world'});
});
it.each(Object.values(channels))('rejects untrusted senders on %s',channel=>{
  for(const bad of [{sender:{}},{sender:contents,senderFrame:{url:entry}},{sender:contents,senderFrame:null}])
    expect(()=>mocks.handlers.get(channel)!(bad as IpcMainInvokeEvent)).toThrow('Untrusted');
  frame.url='https://example.com';expect(()=>call(channel)).toThrow('Untrusted');frame.url=entry;
  registerPredictionIpc(()=>null,entry,()=>store as unknown as StoreAccess);expect(()=>call(channel)).toThrow('Untrusted');
  expect(store.predict).not.toHaveBeenCalled();
});
it('never lets renderer choose sources, N, pool size, SQL or consent',()=>{
  for(const injected of [{sourceIds:[]},{maxN:7},{poolSize:100},{ngramScales:[100,100,100,100,100,100,100]},{sql:'select'},{personalLearning:true}])
    expect(()=>call(channels.predict,{prefix:'',context:[],...injected})).toThrow('prefix/context');
});
it('validates six-word bounds and every request field before storage',()=>{
  for(const args of [[],[null],['text'],[{prefix:'a'.repeat(129),context:[]}],[{prefix:'',context:Array(7).fill('a')}],
    [{prefix:'; drop',context:[]}],[{prefix:'',context:['two words']}],[{prefix:'',context:[],avoidWord:'bad word'}],[{prefix:'',context:[]},'extra']])
    expect(()=>call(channels.predict,...args)).toThrow();
  expect(store.predict).not.toHaveBeenCalled();
});
it('validates settings atomically and bounds integers in main',async()=>{
  for(const change of [{maxN:8},{maxN:1.1},{poolSize:0},{previewWords:11},{acceptWords:4},{sourceMode:'cloud'},{ngramScales:[-1,1,1,1,1,1,1]},{ngramScales:[251,1,1,1,1,1,1]},{ngramScales:[1,1]},{sql:'x'}])
    expect(()=>call(channels.configure,{...defaultPredictionSettings,...change})).toThrow();
  expect(store.setPredictionSettings).not.toHaveBeenCalled();
  await expect(call(channels.configure,{...defaultPredictionSettings,maxN:7})).resolves.toMatchObject({ok:true,value:{maxN:7}});
  await expect(call(channels.configure,{...defaultPredictionSettings,ngramScales:[0,250,1,1,1,1,1]})).resolves.toMatchObject({ok:true,value:{ngramScales:[0,250,1,1,1,1,1]}});
  expect(()=>call(channels.settings,'extra')).toThrow('no arguments');
});
it('sanitizes rejected background operations and permits retry',async()=>{
  store.predict.mockRejectedValueOnce(new Error('/private/path.sqlite3'));
  await expect(call(channels.predict,{prefix:'',context:[]})).resolves.toEqual({ok:false,error:'Could not load local predictions. Please try again.'});
  await expect(call(channels.predict,{prefix:'',context:[]})).resolves.toMatchObject({ok:true});
});
