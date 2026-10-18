// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { defaultNgramScales } from '../../src/shared/prediction';
import { afterEach, beforeEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SourceStore } from '../../src/main/storage/store';
import { PredictionEngine } from '../../src/main/prediction/engine';
import { ngramBatches, indexBatchSize } from '../../src/main/storage/tokenize';
import { downgradeToV3 } from '../fixtures/schema-v3';
let dir:string,filename:string,store:SourceStore,db:Database.Database;
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),'typenudge-pool-'));filename=path.join(dir,'index.sqlite3');store=new SourceStore(filename);db=new Database(filename);});
afterEach(()=>{db.close();store.close();rmSync(dir,{recursive:true,force:true});});
function source(key:string,text=''){store.replace(key,key+'.txt',text);return store.list().find(s=>s.name===key+'.txt')!.id;}
it('combines files before per-N LIMIT, including 7+4=11 and a candidate outside each file top X',()=>{
  const a=source('a'),b=source('b');const insert=db.prepare('INSERT INTO ngrams VALUES (?,?,?,?,?,?)');
  for(const [id,rows] of [[a,[['alpha',8],['bravo',7],['shared',6]]],[b,[['delta',8],['echo',7],['shared',6]]]] as const)
    for(const [word,count] of rows)insert.run(id,3,'["a","b"]',word,word,count);
  insert.run(a,2,'["b"]','c','C',7);insert.run(b,2,'["b"]','c','C',4);
  const engine=new PredictionEngine(store.predictionRepository(),128,()=>0);
  const result=engine.predict({ngramScales:defaultNgramScales,prefix:'',context:['a','b'],sourceIds:[a,b],maxN:3,poolSize:2,previewWords:1});
  expect(result.candidates).toEqual([{word:'shared',display:'shared',frequency:12},{word:'c',display:'C',frequency:11}]);
  store.setEnabled(b,false);
  expect(engine.predict({ngramScales:defaultNgramScales,prefix:'',context:['a','b'],sourceIds:[a,b],maxN:3,poolSize:3,previewWords:1}).candidates.find(c=>c.word==='c')?.frequency).toBe(7);
});
it('implements the documented exact cutoffs, omitted counts, 18/12 scores and random boundary',()=>{
  const id=source('manual');const insert=db.prepare('INSERT INTO ngrams VALUES (?,?,?,?,?,?)');
  for(const [word,counts] of [['alma',[11,6,1]],['körte',[10,1,0]],['szilva',[8,7,5]],['barack',[3,1,1]]] as const)
    counts.forEach((count,index)=>{if(count)insert.run(id,index+1,index===0?'':index===1?'["b"]':'["a","b"]',word,word,count);});
  let r=.599999;const engine=new PredictionEngine(store.predictionRepository(),128,()=>r);
  const input={ngramScales:defaultNgramScales,prefix:'',context:['a','b'],sourceIds:[id],maxN:3 as const,poolSize:2,previewWords:1};
  const result=engine.predict(input);expect(result.candidates.map(c=>[c.word,c.frequency])).toEqual([['alma',18],['szilva',12]]);
  expect(result.words[0]?.word).toBe('alma');r=.6;expect(engine.predict(input).words[0]?.word).toBe('szilva');
});
it('upweights rare N=7 evidence from combined sources virtually, preserving all stored contributions across reopen',()=>{
  const a=source('scale-a'),b=source('scale-b');
  const insert=db.prepare('INSERT INTO ngrams VALUES (?,?,?,?,?,?)');
  insert.run(a,1,'','alma','alma',20);
  insert.run(a,1,'','körte','körte',1); // Outside the unigram top 1; this count must not enter the final score.
  insert.run(a,7,'["a","b","c","d","e","f"]','körte','körte',1);
  insert.run(b,7,'["a","b","c","d","e","f"]','körte','körte',1);
  const rows=db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all();
  const sources=store.list(),revision=db.prepare("SELECT value FROM settings WHERE key='indexRevision'").get();
  const preferences={...store.getPredictionSettings(),maxN:7 as const,poolSize:1,previewWords:1,acceptWords:1};
  store.setPredictionSettings(preferences);
  const input={prefix:'',context:['a','b','c','d','e','f']};
  expect(store.predict(input).candidates).toEqual([{word:'alma',display:'alma',frequency:20}]);
  store.setPredictionSettings({...preferences,ngramScales:[0,0,0,0,0,0,0]});
  expect(store.predict(input)).toMatchObject({candidates:[],words:[]});
  const ngramScales=[0,0,0,0,0,0,250] as const;
  store.setPredictionSettings({...preferences,ngramScales});
  expect(store.predict(input).candidates).toEqual([{word:'körte',display:'körte',frequency:500}]);
  expect(store.predict({...input,context:[]}).words).toEqual([]);
  expect(store.list()).toEqual(sources);
  expect(db.prepare("SELECT value FROM settings WHERE key='indexRevision'").get()).toEqual(revision);
  expect(db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all()).toEqual(rows);
  store.close();store=new SourceStore(filename);
  expect(store.getPredictionSettings().ngramScales).toEqual(ngramScales);
  expect(store.predict(input).words[0]).toEqual({word:'körte',display:'körte',frequency:500});
  store.setPredictionSettings(preferences);
  expect(store.predict(input).words[0]?.word).toBe('alma');
});
it('adds default 1× settings to schema 4 without rewriting indices, and rolls this migration back on failure',()=>{
  source('schema-four','a b c d e f g');
  store.personal.setLearning(true);
  const note=store.personal.save({id:null,revision:null,name:'Saved',text:'learned local writing'});
  const before=db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all();
  const revision=db.prepare("SELECT value FROM settings WHERE key='indexRevision'").get(),sources=store.list();
  db.exec("DELETE FROM settings WHERE key='ngramScales'; PRAGMA user_version=4; CREATE TRIGGER reject_scale BEFORE INSERT ON settings WHEN new.key='ngramScales' BEGIN SELECT RAISE(ABORT,'fixture'); END");
  store.close();expect(()=>new SourceStore(filename)).toThrow();
  expect(db.pragma('user_version',{simple:true})).toBe(4);
  expect(db.prepare("SELECT value FROM settings WHERE key='ngramScales'").get()).toBeUndefined();
  db.exec('DROP TRIGGER reject_scale');store=new SourceStore(filename);
  expect(db.pragma('user_version',{simple:true})).toBe(5);
  expect(store.getPredictionSettings().ngramScales).toEqual(defaultNgramScales);
  expect(store.list()).toEqual(sources);
  expect(db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all()).toEqual(before);
  expect(db.prepare("SELECT value FROM settings WHERE key='indexRevision'").get()).toEqual(revision);
  expect(store.personal.learning()).toBe(true);expect(store.personal.open(note.id).text).toBe('learned local writing');
});
it('indexes all seven orders with six-word suffixes, bounded batches and no sentence/line bridge',()=>{
  const id=source('seven','a b c d e f g. h i j k l m n\na b c d e f g');
  expect(db.prepare('SELECT n,SUM(frequency) AS total FROM ngrams WHERE source_id=? GROUP BY n ORDER BY n').all(id))
    .toEqual(Array.from({length:7},(_,i)=>({n:i+1,total:(7-i)*3})));
  expect(db.prepare('SELECT context_key,next_token,frequency FROM ngrams WHERE source_id=? AND n=7 ORDER BY context_key').all(id)).toEqual([
    {context_key:'["a","b","c","d","e","f"]',next_token:'g',frequency:2},
    {context_key:'["h","i","j","k","l","m"]',next_token:'n',frequency:1},
  ]);
  const batches=[...ngramBatches(Array.from({length:5000},(_,i)=>'word'+i).join(' '))];
  expect(batches.length).toBeGreaterThan(1);expect(batches.every(b=>b.counts.length<=indexBatchSize)).toBe(true);
  expect(batches.at(-1)?.tokenCount).toBe(5000);
});
it('migrates schema 3 without losing counts, paths, notes or consent and explicitly upgrades retained copies',()=>{
  const id=source('legacy','a b c d e f g');
  db.prepare('INSERT INTO imported_files VALUES (?,?)').run(id,path.join(dir,'missing.txt'));
  store.personal.setLearning(true);const learned=store.personal.save({id:null,revision:null,name:'Learned',text:'a b c d e f g'});
  store.personal.setLearning(false);const unlearned=store.personal.save({id:null,revision:null,name:'Private',text:'never learn this'});store.personal.setLearning(true);
  downgradeToV3(db,[1,3]);
  const before=db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all();
  store.close();store=new SourceStore(filename);
  expect(store.getPredictionSettings()).toEqual({sourceMode:'imported',maxN:3,poolSize:10,previewWords:3,acceptWords:2,ngramScales:defaultNgramScales});
  expect(store.list()[0]?.indexMaxN).toBe(3);expect(store.originalFile(id).path).toBe(path.join(dir,'missing.txt'));
  expect(db.prepare('SELECT * FROM ngrams ORDER BY source_id,n,context_key,next_token').all()).toEqual(before);
  expect(store.personal.open(unlearned.id)).toMatchObject({text:'never learn this',learned:false});
  expect(store.reindex(id).indexMaxN).toBe(7);
  const old=store.personal.open(learned.id);expect(old.indexMaxN).toBe(3);
  expect(store.personal.save({id:old.id,revision:old.revision,name:old.name,text:old.text})).toMatchObject({indexMaxN:7,learned:true});
  expect(store.personal.open(unlearned.id).learned).toBe(false);
  expect(db.pragma('integrity_check',{simple:true})).toBe('ok');
});
it('rolls migration back atomically on failure and refuses future schemas',()=>{
  source('old','old text');downgradeToV3(db);
  db.exec("CREATE TRIGGER reject_migration BEFORE INSERT ON settings WHEN new.key='poolSize' BEGIN SELECT RAISE(ABORT,'fixture'); END");
  store.close();expect(()=>new SourceStore(filename)).toThrow();
  expect(db.pragma('user_version',{simple:true})).toBe(3);
  expect(db.prepare("SELECT sql FROM sqlite_master WHERE name='ngrams'").get()).toEqual(expect.objectContaining({sql:expect.stringContaining('BETWEEN 1 AND 3')}));
  db.exec('DROP TRIGGER reject_migration');store=new SourceStore(filename);
});

it('deletes every N=1–7 contribution of one source while retaining another source',()=>{
  const first=source('first','a b c d e f g'),second=source('second','h i j k l m n');
  const retained=db.prepare('SELECT * FROM ngrams WHERE source_id=? ORDER BY n,context_key,next_token').all(second);
  expect(db.prepare('SELECT frequency FROM ngrams WHERE source_id=? AND n=7').get(first)).toEqual({frequency:1});
  store.delete(first);
  expect(db.prepare('SELECT * FROM ngrams WHERE source_id=?').all(first)).toEqual([]);
  expect(db.prepare('SELECT * FROM ngrams WHERE source_id=? ORDER BY n,context_key,next_token').all(second)).toEqual(retained);
});
