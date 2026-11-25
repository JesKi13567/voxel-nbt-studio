'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {gzipSync,deflateSync,gunzipSync}=require('node:zlib');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {Structure,create,clipBytes,clipThumb}=require('../lib/nbt');
const int=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b;};
const cat=(...a)=>Buffer.concat(a.map(v=>typeof v==='number'?Buffer.from([v]):v));
const str=s=>{const b=Buffer.from(s);return cat(0,b.length,b);};
const field=(t,n,b)=>cat(t,str(n),b);
const list=(t,...v)=>cat(t,int(v.length),...v);
const compound=(...v)=>cat(...v,0);
const summoned=id=>cat(10,str(''),compound(field(8,'id',str(id))));
const state=(n,modern=false)=>compound(field(8,modern?'id':'Name',str(n)));
const block=(state,x,y,z,...fields)=>compound(field(9,'pos',list(3,int(x),int(y),int(z))),field(3,'state',int(state)),...fields);
const fixture=(alt=false)=>cat(10,str('structure'),compound(
 field(3,'DataVersion',int(4438)), field(8,'author',str('Tester')),
 field(9,'size',list(3,int(4),int(3),int(4))),
 alt?field(9,'palettes',list(9,list(10,state('minecraft:chest'),state('minecraft:stone'),state('minecraft:air')),list(10,state('minecraft:barrel'),state('minecraft:dirt'),state('minecraft:air')))):field(9,'palette',list(10,state('minecraft:chest'),state('minecraft:stone'),state('minecraft:air'))),
 field(9,'blocks',list(10,block(0,0,0,0,field(10,'nbt',compound(field(8,'id',str('minecraft:chest')),field(12,'Values',cat(int(1),int(107),int(109))))),field(7,'extra',cat(int(2),5,7))),block(1,1,0,0),block(2,2,0,0))),
 field(9,'entities',list(10,compound(field(10,'nbt',compound(field(8,'id',str('minecraft:armor_stand'))))))),field(11,'other',cat(int(1),int(321)))));

test('unchanged file is byte-identical for gzip/zlib/raw',async()=>{
 const raw=fixture();for(const [buf,zip] of [[raw,'raw'],[gzipSync(raw),'gzip'],[deflateSync(raw),'zlib']]){const s=await Structure.open(buf);assert.deepEqual(s.size,[4,3,4]);assert.equal(s.zip,zip);assert.equal(s.snapshot().visible,2);assert.equal(s.entities,1);assert.equal(s.blockData(0).id,'minecraft:chest');assert.deepEqual(await s.serialize(),buf);}
});
test('single edits only change targets, preserve extra NBT, support undo and redo',async()=>{
 const raw=fixture();const s=await Structure.open(gzipSync(raw));
 const protection=s.edit({tool:'erase',points:[[0,0,0]]});assert.equal(protection.skipped,1);assert.equal(protection.changes.length,0);
 const toggle=s.edit({tool:'paint',points:[[0,0,0]],state:{name:'minecraft:chest',props:{facing:'west'}}});assert.equal(toggle.added.id,3);assert.equal(s.blockData(0).id,'minecraft:chest');
 const paint=s.edit({tool:'place',state:{name:'minecraft:oak_log',props:{axis:'y'}},points:[[3,1,3]],mx:true,mz:true});assert.equal(paint.changes.length,12);
 const out=await s.serialize(), rebuilt=await Structure.open(out);assert.equal(rebuilt.zip,'gzip');assert.equal(rebuilt.snapshot().visible,6);assert.equal(rebuilt.snapshot().states[4].props.axis,'y');assert.equal(rebuilt.blockData(0).id,'minecraft:chest');
 for(const field of ['entities','author','other','extra','Values'])assert.ok(gunzipSync(out).includes(Buffer.from(field)));
 s.apply(paint.changes,false);s.apply(toggle.changes,false);assert.deepEqual(gunzipSync(await s.serialize()),raw);
 s.apply(toggle.changes,true);s.apply(paint.changes,true);assert.deepEqual(gunzipSync(await s.serialize()),gunzipSync(out));
});
test('box operations, multi palette, protected delete, sparse coordinates',async()=>{
 const s=await Structure.open(fixture(true));assert.equal(s.snapshot(1).states[1].name,'minecraft:dirt');
 const a=s.edit({tool:'fill',box:[[3,2,3],[1,1,3]],state:{name:'minecraft:oak_log',props:{}}});assert.equal(a.changes.length,18);
 const b=s.edit({tool:'fill',box:[[0,0,0],[3,0,0]],state:3,palette:1},(doc,c,p)=>(doc.at(c)>>1)===2&&p===1);assert.equal(b.changes.length,3);
 assert.throws(()=>s.edit({tool:'replace',box:[[0,0,0],[3,0,0]],state:3}),/未知编辑工具/);
 const c=s.edit({tool:'erase',allowNbt:true,points:[[0,0,0]]});assert.equal(c.changes.length,3);assert.equal(s.blockData(0),null);
 const o=await Structure.open(await s.serialize());assert.equal(o.palettes.length,2);assert.equal(o.snapshot(1).visible,7);assert.equal(o.snapshot(1).states[3].name,'minecraft:oak_log');
 assert.throws(()=>s.edit({tool:'erase',points:[[-1,0,0]]}),/边界/);
});
test('modern templates, new empty model and malformed input',async()=>{
 const s=await Structure.open(create([3,2,3]));assert.equal(s.snapshot().visible,0);
 s.edit({tool:'place',points:[[1,0,1]],state:{name:'minecraft:iron_chain',props:{axis:'y'}}});let raw=await s.serialize();assert.ok(raw.includes(Buffer.from('properties')));assert.ok(!raw.includes(Buffer.from('Properties')));
 const r=await Structure.open(raw);assert.deepEqual(r.paletteView(),[{name:'minecraft:iron_chain',props:{axis:'y'}}]);
 await assert.rejects(Structure.open(raw.subarray(0,raw.length-2)),/截断/);await assert.rejects(Structure.open(Buffer.from('other text')),/Java/);assert.throws(()=>create([4096,4096,4096]),/超限/);
});
test('worker load/edit/save returns readable structure',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'voxel_test_'));const p=path.join(dir,'sample.nbt');await writeFile(p,gzipSync(fixture()));
 const w=new Worker(path.join(__dirname,'../lib/worker.js'));let id=0;
 const call=(method,...args)=>new Promise((yes,no)=>{w.once('message',v=>v.error?no(new Error(v.error)):yes(v.result));w.postMessage({id:++id,method,args});});
 try{assert.match(await call('load',p,null),/^[0-9a-f]{64}$/);assert.equal((await call('view',0)).visible,2);await call('edit',{tool:'erase',points:[[1,0,0]]});const buf=(await call('save')).data;assert.equal((await Structure.open(buf)).snapshot().visible,1);}finally{await w.terminate();await rm(dir,{recursive:true,force:true});}
});
test('Scythe-style grid translation and extrusion are atomic and undoable',async()=>{
 const s=await Structure.open(create([8,8,8]));
 s.edit({tool:'fill',box:[[1,1,1],[2,1,1]],state:{name:'minecraft:oak_log',props:{axis:'x'}}});
 const src=[[1,1,1],[2,1,1]].map(p=>s.cell(p));
 const undo=s.edit({tool:'move',selection:src,delta:[1,0,0]});
 assert.equal(s.state((s.at(src[0])>>1)-1).name,'minecraft:air');assert.equal(s.snapshot().visible,2);
 assert.deepEqual(undo.selection,[[2,1,1],[3,1,1]].map(p=>s.cell(p)));
 const ext=s.edit({tool:'extrude',selection:undo.selection,delta:[0,2,0]});
 assert.equal(s.snapshot().visible,6);assert.equal(ext.selection.length,6);
 assert.throws(()=>s.edit({tool:'move',selection:undo.selection,delta:[0,1,0]}),/未选中的/);
 assert.throws(()=>s.edit({tool:'extrude',selection:undo.selection,delta:[0,-3,0]}),/边界/);
 assert.equal(s.snapshot().visible,6);
 s.apply(ext.changes,false);s.apply(undo.changes,false);assert.equal(s.snapshot().visible,2);assert.ok(s.at(src[0]));
 const protectedDoc=await Structure.open(fixture());assert.throws(()=>protectedDoc.edit({tool:'move',selection:[0],delta:[0,1,0]}),/方块实体/);
});
test('allowed move retains block entity, unknown fields, 64-bit NBT, can undo and redo',async()=>{
 const s=await Structure.open(gzipSync(fixture()));const chest=s.cell([0,0,0]);const newPos=s.cell([0,1,0]);
 const original=s.tileAt(chest).toString('hex');
 assert.throws(()=>s.edit({tool:'move',selection:[chest],delta:[0,1,0]}),/允许移动/);
 const a=s.edit({tool:'move',selection:[chest],delta:[0,1,0],allowMoveNbt:true});
 assert.equal(s.tileInfo(chest),null);assert.equal(s.tileInfo(newPos).data.id,'minecraft:chest');
 assert.equal(s.tileAt(newPos).toString('hex'),original);
 const restored=await Structure.open(await s.serialize());assert.equal(restored.tileAt(newPos).toString('hex'),original);
 assert.throws(()=>s.edit({tool:'extrude',selection:[newPos],delta:[0,1,0],allowMoveNbt:true}),/不挤出/);
 s.apply(a.changes,false,a.tiles);assert.equal(s.tileAt(chest).toString('hex'),original);assert.equal(s.tileInfo(newPos),null);
 s.apply(a.changes,true,a.tiles);assert.equal(s.tileAt(newPos).toString('hex'),original);
});
test('field editing stores native SNBT types, preserves untouched NBT and rejects silent type changes',async()=>{
 const s=await Structure.open(fixture());const c=s.cell([0,0,0]);
 const a=s.edit({tool:'tile',cell:c,path:'LootTableSeed',text:'9223372036854775807L'});
 assert.deepEqual(s.tileValue(c,'LootTableSeed'),{type:4,text:'9223372036854775807L'});
 assert.throws(()=>s.edit({tool:'tile',cell:c,path:'LootTableSeed',text:'2'}),/类型/);
 s.edit({tool:'tile',cell:c,path:'config.key_item',text:'{id:"minecraft:trial_key",count:1,data:[I;1,2,3],samples:[B;1b,2b],name:"🗝️\\u0000"}'});
 const newer=await Structure.open(await s.serialize());
 assert.equal(newer.tileValue(c,'config.key_item.name').text,JSON.stringify('🗝️\0'));assert.match(newer.tileValue(c,'config.key_item').text,/\[I;1,2,3\]/);
 assert.match(newer.tileValue(c,'Values').text,/\[L;459561500781L\]/);
 assert.throws(()=>s.edit({tool:'tile',cell:c,path:'id',text:'"foo"'}),/不能/);
 assert.throws(()=>s.edit({tool:'tile',cell:c,path:'Items',text:'[I;1,"bad"]'}),/类型/);
 s.edit({tool:'tile',cell:c,path:'config.key_item.count',remove:true});assert.equal(s.tileValue(c,'config.key_item.count'),null);
 s.apply(a.changes,false,a.tiles);assert.equal(s.tileValue(c,'LootTableSeed'),null);
});
test('modern tile lists round-trip mixed tags and literal empty-key compounds',async()=>{
 const template=fixture(),s=await Structure.open(template),path='config.custom';
 const text='[1,"text",{"":2},{"":3,"real":4},[1b,2L],[I;1,2],{}]';
 s.edit({tool:'tile',cell:0,path,text});
 const d=await Structure.open(await s.serialize());assert.deepEqual(d.tileValue(0,path),{type:9,text});
 assert.match(d.tileInfo(0).text,/"custom": \[/);assert.equal(d.tileValue(0,path).text,text);
 const encoded=cat(10,int(7),compound(field(3,'',int(1))),compound(field(8,'',str('text'))));
 assert.ok(d.tileField(0,path).bytes.subarray(0,encoded.length).equals(encoded));
 d.edit({tool:'tile',cell:0,path,text:'[1,2,3]'});assert.equal(d.tileField(0,path).bytes[0],3);
 const old=Buffer.from(template);old.writeInt32BE(4324,old.indexOf(Buffer.from('DataVersion'))+11);
 const legacy=await Structure.open(old);assert.throws(()=>legacy.edit({tool:'tile',cell:0,path,text}),/1.21.5/);
 legacy.edit({tool:'tile',cell:0,path,text:'[{"":2}]'});assert.equal(legacy.tileValue(0,path).text,'[{"":2}]');
});
test('layout variants share indexes; resize guards crop and preserves entities inside',async()=>{
 const s=await Structure.open(fixture());let x=s.layout({kind:'paletteAdd',palette:0});
 let d=await Structure.open(x.raw);assert.equal(d.palettes.length,2);assert.equal(x.active,1);
 x=d.layout({kind:'paletteState',palette:1,stateId:1,state:{name:'minecraft:amethyst_block',props:{}}});d=await Structure.open(x.raw);
 assert.equal(d.state(1,0).name,'minecraft:stone');assert.equal(d.state(1,1).name,'minecraft:amethyst_block');
 assert.throws(()=>d.layout({kind:'paletteState',palette:1,stateId:0,state:{name:'minecraft:dirt',props:{}}}),/方块实体/);
 x=d.layout({kind:'paletteDelete',palette:0});d=await Structure.open(x.raw);assert.equal(d.palettes.length,1);assert.equal(d.state(1).name,'minecraft:amethyst_block');
 assert.throws(()=>d.layout({kind:'paletteDelete',palette:0}),/至少/);
 x=d.layout({kind:'size',palette:0,size:[7,4,6]});d=await Structure.open(x.raw);assert.deepEqual(d.size,[7,4,6]);assert.equal(d.snapshot().visible,2);assert.equal(d.entities,1);
 x=d.layout({kind:'size',palette:0,size:[1,1,1]});assert.deepEqual(x.confirm,{size:[1,1,1],cut:122,cutTiles:0,cutEntities:0});
 x=d.layout({kind:'size',palette:0,size:[1,1,1],crop:true});d=await Structure.open(x.raw);assert.equal(d.snapshot().visible,1);assert.equal(d.tileInfo(0).data.id,'minecraft:chest');
});
test('resizing records air only in the newly added volume, across all palette variants',async()=>{
 const before=await Structure.open(fixture(true));
 const edited=await Structure.open(before.layout({kind:'paletteState',palette:1,stateId:2,state:{name:'minecraft:dirt',props:{}}}).raw);
 const grow=edited.layout({kind:'size',palette:1,size:[5,4,4]});const doc=await Structure.open(grow.raw);
 const name=(d,p,variant=0)=>d.state((d.at(d.cell(p))>>1)-1,variant)?.name;
 assert.equal(doc.snapshot().records,3+(5*4*4-4*3*4));
 assert.equal(name(doc,[1,1,1]),undefined);assert.equal(name(doc,[2,0,0]),'minecraft:air');assert.equal(name(doc,[2,0,0],1),'minecraft:dirt');
 for(const p of [[4,0,0],[0,3,3],[4,3,3]])for(const variant of [0,1])assert.equal(name(doc,p,variant),'minecraft:air');
 assert.equal(doc.paletteCount,4);assert.equal(doc.blockData(0).id,'minecraft:chest');
 const mixed=doc.layout({kind:'size',palette:1,size:[3,5,2],crop:true});const result=await Structure.open(mixed.raw);
 assert.equal(name(result,[1,4,1],1),'minecraft:air');assert.equal(name(result,[1,1,1]),undefined);
 assert.equal(result.paletteCount,4);
});
test('layout undo in worker keeps earlier and later transaction history',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'voxel_layout_'));const p=path.join(dir,'sample.nbt');await writeFile(p,gzipSync(fixture()));
 const worker=new Worker(path.join(__dirname,'../lib/worker.js'));let id=0;
 const call=(method,...args)=>new Promise((yes,no)=>{worker.once('message',v=>v.error?no(new Error(v.error)):yes(v.result));worker.postMessage({id:++id,method,args});});
 try{await call('load',p,null);
  const a=await call('edit',{tool:'tile',cell:0,path:'test',text:'1L'});
  const first=await call('layout',{kind:'paletteAdd',palette:0});const second=await call('layout',{kind:'size',palette:1,size:[10,10,10]});
  assert.equal((await call('view',1)).count,2);await call('restoreLayout',second.token,false);assert.equal((await call('view',1)).size[0],4);
  await call('restoreLayout',first.token,false);await call('apply',a.changes,false,a.tiles);assert.equal(await call('tileValue',0,'test'),null);
  await call('apply',a.changes,true,a.tiles);await call('restoreLayout',first.token,true);await call('restoreLayout',second.token,true);
  assert.equal((await call('tileValue',0,'test')).text,'1L');assert.equal((await call('view',1)).size[0],10);
  const brush=await call('edit',{tool:'place',points:[[3,0,0]],state:{name:'minecraft:dirt',props:{}}});
  await call('apply',brush.changes,false,brush.tiles,brush.added);
  const slots=(await call('view',1)).states.length,clean=await call('layout',{kind:'paletteClean',palette:1});assert.equal(clean.removed,1);
  assert.equal((await call('view',1)).states.length,slots-1);await call('restoreLayout',clean.token,false);
  assert.equal((await call('view',1)).states.length,slots);await call('restoreLayout',clean.token,true);
  assert.equal((await call('view',1)).states.length,slots-1);assert.equal((await call('tileValue',0,'test')).text,'1L');
 }finally{await worker.terminate();await rm(dir,{recursive:true,force:true});}
});
test('worker edge edits grow with undo, preserve metadata and reject growth on failed edits',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'voxel_growth_')),file=path.join(dir,'sample.nbt');
 const dbl=n=>{const b=Buffer.alloc(8);b.writeDoubleBE(n);return b;};
 const tile=compound(field(8,'id',str('minecraft:chest')),field(3,'x',int(0)),field(3,'y',int(0)),field(3,'z',int(0)));
 const entity=compound(field(9,'pos',list(6,dbl(.5),dbl(0),dbl(.5))),field(9,'blockPos',list(3,int(0),int(0),int(0))),field(10,'nbt',compound(field(8,'id',str('minecraft:armor_stand')))));
 const raw=cat(10,str(''),compound(field(3,'DataVersion',int(5023)),field(9,'size',list(3,int(2),int(1),int(2))),
  field(9,'palette',list(10,state('minecraft:chest',true),state('minecraft:stone',true))),
  field(9,'blocks',list(10,block(0,0,0,0,field(10,'nbt',tile)),block(1,1,0,1))),
  field(9,'entities',list(10,entity)),field(8,'author',str('kept'))));
 await writeFile(file,raw);const worker=new Worker(path.join(__dirname,'../lib/worker.js'));let id=0;
 const call=(method,...args)=>new Promise((yes,no)=>{worker.once('message',v=>v.error?no(new Error(v.error)):yes(v.result));worker.postMessage({id:++id,method,args});});
 const current=async()=>Structure.open(Buffer.from((await call('save')).data));
 const name=(doc,p)=>doc.state((doc.at(doc.cell(p))>>1)-1)?.name;
 try{
  await call('load',file,null);
  await assert.rejects(call('edit',{tool:'extrude',selection:[0],delta:[-1,0,0],palette:0}),/不挤出/);
  assert.deepEqual((await current()).size,[2,1,2]);
  const a=await call('edit',{tool:'place',points:[[-1,0,-1]],mx:true,state:{name:'minecraft:gold_block',props:{}},palette:0});
  assert.deepEqual(a.offset,[1,0,1]);assert.deepEqual(a.size,[4,1,3]);const grown=await current();
  assert.equal(name(grown,[0,0,0]),'minecraft:gold_block');assert.equal(name(grown,[3,0,0]),'minecraft:gold_block');
  const chest=grown.blockData(grown.cell([1,0,1]));assert.deepEqual([chest.x,chest.y,chest.z],[1,0,1]);
  assert.equal(grown.entities,1);assert.ok(grown.b.includes(field(9,'pos',list(6,dbl(1.5),dbl(0),dbl(1.5)))));
  assert.ok(grown.b.includes(field(9,'blockPos',list(3,int(1),int(0),int(1)))));assert.ok(grown.b.includes(field(8,'author',str('kept'))));
  const b=await call('edit',{tool:'extrude',selection:[grown.cell([2,0,2])],delta:[0,2,0],palette:0});
  assert.deepEqual(b.size,[4,3,3]);assert.equal(name(await current(),[2,2,2]),'minecraft:stone');
  await call('restoreLayout',b.token,false);assert.deepEqual((await current()).size,a.size);
  await call('restoreLayout',a.token,false);assert.deepEqual((await current()).b,raw);
  await call('restoreLayout',a.token,true);await call('restoreLayout',b.token,true);assert.equal(name(await current(),[2,2,2]),'minecraft:stone');
 }finally{await worker.terminate();await rm(dir,{recursive:true,force:true});}
});
test('single-cell state editing keeps tile data and alternative palettes unchanged',async()=>{
 const s=await Structure.open(fixture(true));const pos=s.cell([0,0,0]);
 assert.throws(()=>s.edit({tool:'state',cell:pos,box:[[0,0,0],[1,0,0]],key:'facing',value:'east',expected:0}),/一个方块/);
 const a=s.edit({tool:'state',cell:pos,palette:1,key:'facing',value:'east',expected:0});
 assert.deepEqual(a.added.variants,[{name:'minecraft:chest',props:{}},{name:'minecraft:barrel',props:{facing:'east'}}]);
 const d=await Structure.open(await s.serialize());const slot=(d.at(pos)>>1)-1;
 assert.equal(d.state(slot,0).name,'minecraft:chest');assert.equal(d.state(slot,1).props.facing,'east');
 assert.equal(d.tileValue(pos,'Values').text,s.tileValue(pos,'Values').text);
 assert.deepEqual(d.state((d.at(d.cell([1,0,0]))>>1)-1,1),{name:'minecraft:dirt',props:{}});
 s.apply(a.changes,false,[],a.added);assert.equal(s.at(pos)>>1,1);
});
test('move overwrite is opt-in, limited to destination IDs, and atomic',async()=>{
 const doc=await Structure.open(fixture());const air=doc.cell([2,0,0]),src=doc.cell([3,0,0]),stone=doc.cell([1,0,0]),chest=doc.cell([0,0,0]);
 doc.edit({tool:'place',points:[[3,0,0]],state:{name:'minecraft:oak_log',props:{axis:'x'}}});
 const edit={tool:'move',selection:[src],delta:[-2,0,0]};const before=await doc.serialize();
 assert.throws(()=>doc.edit(edit),/未选中/);
 assert.throws(()=>doc.edit({...edit,moveOverwrite:true,overwriteIds:['minecraft:dirt']}),/白名单/);
 assert.deepEqual(await doc.serialize(),before);
 const a=doc.edit({...edit,moveOverwrite:true,overwriteIds:['minecraft:stone']});
 assert.equal(doc.state((doc.at(stone)>>1)-1).name,'minecraft:oak_log');assert.equal(doc.state((doc.at(src)>>1)-1).name,'minecraft:air');assert.equal(doc.at(air)>>1,3);
 doc.apply(a.changes,false,a.tiles);assert.deepEqual(await doc.serialize(),before);
 doc.apply(a.changes,true,a.tiles);
 const tile=doc.tileAt(chest);const intoChest={tool:'move',selection:[stone],delta:[-1,0,0],moveOverwrite:true};
 assert.throws(()=>doc.edit(intoChest),/允许丢弃目标方块实体数据/);
 assert.throws(()=>doc.edit({...intoChest,tool:'extrude',allowNbt:true}),/未选中/);
 const b=doc.edit({...intoChest,allowNbt:true});assert.equal(doc.tileAt(chest),null);
 doc.apply(b.changes,false,b.tiles);assert.deepEqual(doc.tileAt(chest),tile);
});

test('move collision checks inactive palette variants and protects against mixed-target writes',async()=>{
 const doc=await Structure.open(fixture(true));
 const replace=doc.layout({kind:'paletteState',palette:0,stateId:1,state:{name:'minecraft:air',props:{}}});
 const d=await Structure.open(replace.raw); const source=d.cell([2,0,0]);d.edit({tool:'place',points:[[2,0,0]],state:{name:'minecraft:oak_log',props:{}}});
 const edit={tool:'move',selection:[source],delta:[-1,0,0],palette:0};
 assert.throws(()=>d.edit(edit),/未选中/);
 assert.throws(()=>d.edit({...edit,moveOverwrite:true,overwriteIds:['minecraft:stone']}),/dirt/);
 assert.equal(d.state((d.at(d.cell([1,0,0]))>>1)-1,1).name,'minecraft:dirt');
 d.edit({...edit,moveOverwrite:true,overwriteIds:['minecraft:dirt']});assert.equal(d.state((d.at(d.cell([1,0,0]))>>1)-1,1).name,'minecraft:oak_log');
 const x=await Structure.open(fixture()),original=await x.serialize();
 x.edit({tool:'place',points:[[0,1,0],[1,1,0]],state:{name:'minecraft:oak_log',props:{}}});
 const before=await x.serialize();
 assert.throws(()=>x.edit({tool:'move',selection:[x.cell([1,1,0]),x.cell([0,1,0])],delta:[0,-1,0],moveOverwrite:true,overwriteIds:['minecraft:stone']}),/白名单/);
 assert.deepEqual(await x.serialize(),before);assert.notDeepEqual(before,original);
});

test('rotation around a chosen pivot preserves NBT and updates all palette variants atomically',async()=>{
 const doc=await Structure.open(fixture(true));
 doc.edit({tool:'place',points:[[2,1,1]],state:{name:'minecraft:oak_log',props:{axis:'x'}}});
 doc.edit({tool:'place',points:[[2,1,2]],state:{name:'minecraft:observer',props:{facing:'east'}}});
 const a=doc.cell([2,1,1]),b=doc.cell([2,1,2]);
 const q={tool:'rotate',selection:[a,b],axis:1,pivot:[1.5,1.5,1.5],turns:-1};
 const before=await doc.serialize(),change=doc.edit(q),get=(xyz,p)=>doc.state((doc.at(doc.cell(xyz))>>1)-1,p);
 assert.deepEqual(change.selection,[doc.cell([1,1,2]),doc.cell([0,1,2])]);assert.equal(change.added.length,2);
 for(const p of [0,1]){assert.equal(get([1,1,2],p).props.axis,'z');assert.equal(get([0,1,2],p).props.facing,'south');}
 doc.apply(change.changes,false,change.tiles,change.added);assert.equal(get([2,1,1],1).props.axis,'x');
 doc.apply(change.changes,true,change.tiles,change.added);assert.equal(get([0,1,2],0).props.facing,'south');
 const chest={tool:'rotate',selection:[0],axis:1,pivot:[1.5,.5,.5],turns:-1};
 assert.throws(()=>doc.edit(chest),/方块实体/);assert.throws(()=>doc.edit({...chest,allowMoveNbt:true}),/边界/);
 assert.throws(()=>doc.edit({...q,pivot:[1,1.5,1.5]}),/轴心/);
 const c=doc.edit({...chest,turns:2,allowMoveNbt:true});assert.equal(doc.tileInfo(doc.cell([2,0,0])).data.id,'minecraft:chest');
 doc.apply(c.changes,false,c.tiles,c.added);assert.equal(doc.tileInfo(0).data.id,'minecraft:chest');
 assert.notDeepEqual(await doc.serialize(),before);
});

test('X and Z rotation keeps integral coordinates, rotates allowed states, and warns about tilt limits',async()=>{
 const d=await Structure.open(create([5,5,5])),c=d.cell([3,2,2]);
 d.edit({tool:'place',points:[[3,2,2]],state:{name:'minecraft:observer',props:{facing:'east'}}});
 d.edit({tool:'place',points:[[2,2,2]],state:{name:'minecraft:oak_stairs',props:{facing:'north'}}});
 let q={tool:'rotate',axis:2,turns:1,pivot:[2.5,2.5,2.5],selection:[c,d.cell([2,2,2])]};
 const turn=d.edit(q);assert.equal(turn.limited,1);
 assert.equal(d.state((d.at(d.cell([2,3,2]))>>1)-1).props.facing,'up');
 q={...q,axis:0,selection:turn.selection};d.edit(q);assert.equal(d.state((d.at(d.cell([2,2,3]))>>1)-1).props.facing,'south');
 const tile=d.cell([2,2,2]);d.edit({tool:'paint',points:[[2,2,2]],state:{name:'minecraft:stone',props:{}}});
 const block=d.cell([2,2,3]),before=await d.serialize();
 assert.throws(()=>d.edit({tool:'rotate',axis:0,turns:1,pivot:[2.5,3,3],selection:[block]}),/未选中/);
 assert.deepEqual(await d.serialize(),before);assert.ok(d.at(tile));
});

test('palette cleanup removes only unreferenced slots and preserves explicit air, variants and NBT',async()=>{
 const doc=await Structure.open(fixture(true)),original=doc.tileAt(0);
 doc.edit({tool:'place',points:[[3,0,0]],state:{name:'minecraft:gold_block',props:{}}});
 doc.edit({tool:'paint',points:[[3,0,0]],state:{name:'minecraft:air',props:{}}});
 doc.edit({tool:'place',points:[[3,0,1]],state:{name:'minecraft:bricks',props:{}}});
 const clean=doc.layout({kind:'paletteClean',palette:1});assert.equal(clean.removed,1);assert.equal(clean.active,1);
 const d=await Structure.open(clean.raw);
 assert.deepEqual(d.palettes.map(p=>p.states.map(s=>s.name)),[['minecraft:chest','minecraft:stone','minecraft:air','minecraft:bricks'],['minecraft:barrel','minecraft:dirt','minecraft:air','minecraft:bricks']]);
 assert.equal((d.at(d.cell([3,0,0]))>>1)-1,2);assert.equal((d.at(d.cell([3,0,1]))>>1)-1,3);
 assert.deepEqual(d.tileAt(0),original);assert.equal(d.entities,1);assert.ok(clean.raw.includes(Buffer.from('Tester')));
 assert.equal(d.layout({kind:'paletteClean',palette:0}),null);
});

test('temporary templates copy the active variant and paste transformed NBT atomically',async()=>{
 const source=await Structure.open(fixture(true)),src=source.cell([0,0,0]);
 source.edit({tool:'tile',cell:src,path:'CustomName',text:'"宝箱"'});
 const clip=source.copySelection([src,source.cell([1,0,0]),source.cell([2,0,0])],1);
 assert.deepEqual(clip.states.map(s=>s.name),['minecraft:barrel','minecraft:dirt']);assert.deepEqual(clip.size,[2,1,1]);
 const target=await Structure.open(create([5,5,5])),axes=[[0,0,1],[0,1,0],[-1,0,0]];
 const before=await target.serialize();
 assert.throws(()=>target.paste(clip,[2,2,4],axes),/边界/);assert.deepEqual(await target.serialize(),before);
 assert.throws(()=>target.paste(clip,[2,2,2],[[-1,0,0],[0,1,0],[0,0,1]]),/朝向/);
 const pasted=target.paste(clip,[2,2,2],axes);assert.equal(pasted.selection.length,2);
 assert.equal(target.state((target.at(target.cell([2,2,2]))>>1)-1).name,'minecraft:barrel');
 assert.equal(target.tileValue(target.cell([2,2,2]),'CustomName').text,'"宝箱"');
 assert.equal(target.state((target.at(target.cell([2,2,3]))>>1)-1).name,'minecraft:dirt');
 assert.throws(()=>target.paste(clip,[2,2,2],axes),/已有方块/);
 target.apply(pasted.changes,false,pasted.tiles,pasted.added);assert.deepEqual(await target.serialize(),before);
 target.apply(pasted.changes,true,pasted.tiles,pasted.added);assert.equal((await Structure.open(await target.serialize())).snapshot().visible,2);
 assert.equal(source.tileValue(src,'CustomName').text,'"宝箱"');
});

test('worker copies across documents, rejects collisions, and can undo a pasted group',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'voxel_clip_test_')),file=path.join(dir,'fixture.nbt');
 await writeFile(file,fixture());
 const worker=new Worker(path.join(__dirname,'../lib/worker.js'));let id=0;
 const call=(method,...args)=>new Promise((yes,no)=>{worker.once('message',m=>m.error?no(new Error(m.error)):yes(m.result));worker.postMessage({id:++id,method,args});});
 try{
  await call('load',file,null);
  const clip=await call('copySelection',[0,1],0);assert.equal(clip.blocks[0].tile.byteLength,clip.blocks[0].tile.buffer.byteLength);
  const axes=[[1,0,0],[0,1,0],[0,0,1]];
  await assert.rejects(call('edit',{tool:'paste',origin:[0,0,0],axes},clip),/已有方块/);
  const blank=path.join(dir,'blank.nbt');await writeFile(blank,create([4,3,4]));await call('load',blank,null);
  const edit=await call('edit',{tool:'paste',origin:[1,1,1],axes},clip);
  const newDoc=await Structure.open((await call('save')).data);assert.equal(newDoc.tileInfo(newDoc.cell([1,1,1])).data.id,'minecraft:chest');
  assert.equal(newDoc.snapshot().visible,2);await call('apply',edit.changes,false,edit.tiles,edit.added);
  assert.equal((await call('view',0)).visible,0);
 }finally{await worker.terminate();if(path.dirname(dir)===path.resolve(tmpdir())&&path.basename(dir).startsWith('voxel_clip_test_'))await rm(dir,{recursive:true,force:true});}
});

test('blueprint placement shares destination protection and restores overwritten tile data on undo',async()=>{
 const target=await Structure.open(fixture(true)),before=await target.serialize(),source=await Structure.open(create([1,1,1]));
 source.edit({tool:'place',points:[[0,0,0]],state:{name:'minecraft:gold_block',props:{}}});
 const clip=source.copySelection([0],0),axes=[[1,0,0],[0,1,0],[0,0,1]],config={moveOverwrite:true};
 assert.throws(()=>target.paste(clip,[1,0,0],axes,{...config,overwriteIds:['minecraft:stone']}),/minecraft:dirt/);
 assert.throws(()=>target.paste(clip,[0,0,0],axes,config),/方块实体/);
 const edit=target.paste(clip,[0,0,0],axes,{...config,allowNbt:true});assert.equal(target.tileAt(0),null);
 target.apply(edit.changes,false,edit.tiles,edit.added);assert.deepEqual(await target.serialize(),before);
 assert.equal(target.tileValue(0,'Values').text,'[L;459561500781L]');
 target.apply(edit.changes,true,edit.tiles,edit.added);assert.equal(target.tileAt(0),null);
});

test('ignore fluids skips source cells, allows pure fluid destinations and preserves waterlogged blocks',async()=>{
 const source=await Structure.open(create([3,1,1]));let target=await Structure.open(create([4,1,1]));
 const place=(doc,x,name,props={})=>doc.edit({tool:'place',points:[[x,0,0]],state:{name:'minecraft:'+name,props}});
 place(source,0,'water');place(source,1,'oak_slab',{type:'bottom',waterlogged:'true'});place(source,2,'bubble_column');
 place(target,0,'glass');place(target,1,'lava');place(target,2,'stone');
 const clip=source.copySelection([0,1,2],0),axes=[[1,0,0],[0,1,0],[0,0,1]],before=await target.serialize();target=await Structure.open(before);
 assert.throws(()=>target.paste(clip,[0,0,0],axes),/已有方块/);
 const edit=target.paste(clip,[0,0,0],axes,{ignoreFluids:true});assert.deepEqual(edit.selection,[1]);
 assert.deepEqual([0,1,2].map(i=>target.state((target.at(i)>>1)-1)),[{name:'minecraft:glass',props:{}},{name:'minecraft:oak_slab',props:{type:'bottom',waterlogged:'true'}},{name:'minecraft:stone',props:{}}]);
 assert.throws(()=>target.paste(clip,[-1,0,0],axes,{ignoreFluids:true}),/已有方块/);
 assert.throws(()=>target.paste(source.copySelection([0,2],0),[0,0,0],axes,{ignoreFluids:true}),/没有可放置/);
 target.apply(edit.changes,false,edit.tiles,edit.added);assert.deepEqual(await target.serialize(),before);
});

test('inspector field batches are atomic, expose typed child rows, and preserve unrelated NBT',async()=>{
 const doc=await Structure.open(fixture(true)),c=doc.cell([0,0,0]),before=Buffer.from(doc.tileAt(c));
 const edits=[{path:'config.pool',text:'"heaven:rooms/test"',expectedType:8},{path:'LootTableSeed',text:'459561500781L',expectedType:4}];
 assert.throws(()=>doc.edit({tool:'tile',cell:c,edits:[edits[0],{...edits[1],text:'10'}]}),/类型/);
 assert.throws(()=>doc.edit({tool:'tile',cell:c,edits:[edits[0],{path:'id',text:'"minecraft:jigsaw"'}]}),/不能/);
 assert.deepEqual(doc.tileAt(c),before);
 const result=doc.edit({tool:'tile',cell:c,edits});assert.equal(result.changes.length,3);
 const info=doc.tileInfo(c);assert.ok(info.revision);assert.match(info.text,/"pool": "heaven:rooms\/test"/);
 assert.match(info.text,/"LootTableSeed": 459561500781L/);
 assert.equal(doc.tileValue(c,'Values').text,'[L;459561500781L]');
 doc.apply(result.changes,false,result.tiles,result.added);assert.deepEqual(doc.tileAt(c),before);
});

test('inspector can apply and undo multiple state properties on only the selected variant',async()=>{
 const doc=await Structure.open(fixture(true)),c=doc.cell([0,0,0]),expected=(doc.at(c)>>1)-1;
 assert.throws(()=>doc.edit({tool:'state',cell:c,palette:1,expected,edits:[{key:'facing',value:'west'},{key:'facing',value:'north'}]}),/重复/);
 const {changes,added}=doc.edit({tool:'state',cell:c,palette:1,expected,edits:[{key:'facing',value:'west'},{key:'open',value:'true'}]});
 let id=(doc.at(c)>>1)-1;assert.equal(changes.length,3);
 assert.deepEqual(doc.state(id,1).props,{facing:'west',open:'true'});assert.deepEqual(doc.state(id,0).props,{});assert.equal(doc.tileInfo(c).data.id,'minecraft:chest');
 doc.apply(changes,false,[],added);id=(doc.at(c)>>1)-1;assert.equal(id,expected);
});

test('new vanilla block entities are editable, saved with the correct ID, and correctly undone',async()=>{
 const d=await Structure.open(create([8,2,1])),type=(x,y=0)=>d.tileInfo(d.cell([x,y,0]))?.data?.id;
 const cases=[['chest','chest'],['waxed_exposed_copper_chest','chest'],['trapped_chest','trapped_chest'],['ender_chest','ender_chest'],['shulker_box','shulker_box'],['cyan_shulker_box','shulker_box'],['jigsaw','jigsaw']];
 for(const [x,[name,id]] of cases.entries()){
  const q={tool:'place',points:[[x,0,0]],state:{name:'minecraft:'+name,props:{}}},edit=d.edit(q);
  assert.equal(type(x),'minecraft:'+id);d.apply(edit.changes,false,edit.tiles,edit.added);assert.equal(type(x),undefined);d.apply(edit.changes,true,edit.tiles,edit.added);assert.equal(type(x),'minecraft:'+id);
 }
 const box=d.cell([4,0,0]);d.edit({tool:'tile',cell:box,path:'LootTable',text:'"heaven:test"'});
 const removed=d.edit({tool:'erase',points:[[4,0,0]],allowNbt:true});assert.equal(type(4),undefined);
 d.apply(removed.changes,false,removed.tiles,removed.added);assert.equal(d.tileValue(box,'LootTable').text,'"heaven:test"');
 const changed=d.edit({tool:'paint',points:[[4,0,0]],state:{name:'minecraft:trial_spawner',props:{}},allowNbt:true});assert.equal(type(4),'minecraft:trial_spawner');
 d.apply(changed.changes,false,changed.tiles,changed.added);assert.equal(d.tileValue(box,'LootTable').text,'"heaven:test"');
 const fresh=await Structure.open(await d.serialize());assert.equal(fresh.tileValue(box,'id').text,'"minecraft:shulker_box"');assert.equal(fresh.tileValue(box,'LootTable').text,'"heaven:test"');
});

test('legacy missing block-entity NBT can be explicitly initialized but not assigned to incompatible variants',async()=>{
 const legacy=multi=>cat(10,str(''),compound(field(3,'DataVersion',int(3953)),field(9,'size',list(3,int(2),int(1),int(1))),
  multi?field(9,'palettes',list(9,list(10,state('minecraft:shulker_box')),list(10,state('minecraft:stone')))):field(9,'palette',list(10,state('minecraft:shulker_box'))),field(9,'blocks',list(10,block(0,0,0,0)))));
 const raw=legacy(false),d=await Structure.open(raw);assert.deepEqual(d.tileInfo(0),{canInitialize:true,type:'minecraft:shulker_box'});assert.deepEqual(await d.serialize(),raw);
 const init=d.edit({tool:'tileInit',cell:0});assert.equal(d.tileInfo(0).data.id,'minecraft:shulker_box');assert.throws(()=>d.edit({tool:'tileInit',cell:0}),/不是缺少/);
 d.apply(init.changes,false,init.tiles,init.added);assert.deepEqual(await d.serialize(),raw);
 const multi=await Structure.open(legacy(true));assert.equal(multi.tileInfo(0),null);assert.throws(()=>multi.edit({tool:'tileInit',cell:0}),/变体/);
 multi.edit({tool:'place',points:[[1,0,0]],state:{name:'minecraft:shulker_box',props:{}}});assert.equal(multi.tileAt(1),null);
});


test('structure void is reserved for erase, and invisible erasing is undoable',async()=>{
 const d=await Structure.open(create([6,1,1])),empty={name:'minecraft:structure_void',props:{}};
 const fill=(x,name)=>d.edit({tool:'fill',state:{name,props:{}},points:[[x,0,0]]});
 fill(0,'minecraft:stone');
 for(const tool of ['place','paint','fill'])assert.throws(()=>d.edit({tool,state:empty,points:[[tool==='paint'?0:1,0,0]]}),/只能用擦除/);
 for(const [i,name] of ['air','cave_air','void_air'].entries())fill(i+1,'minecraft:'+name);
 const points=[[1,0,0],[2,0,0],[3,0,0],[4,0,0]];
 assert.equal(d.edit({tool:'erase',points}).changes.length,0);
 const res=d.edit({tool:'erase',points,eraseInvisible:true});assert.equal(res.changes.length,9);
 assert.deepEqual(points.map(p=>d.at(d.cell(p))),[0,0,0,0]);
 d.apply(res.changes,false,res.tiles,res.added);assert.ok(points.slice(0,3).every(p=>d.at(d.cell(p))));
 const old=await Structure.open(cat(10,str(''),compound(field(3,'DataVersion',int(5023)),field(9,'size',list(3,int(2),int(1),int(1))),
  field(9,'palette',list(10,state(empty.name,true))),field(9,'blocks',list(10,block(0,0,0,0))))));
 assert.throws(()=>old.edit({tool:'place',state:0,points:[[1,0,0]]}),/只能用擦除/);
 assert.notEqual(old.at(0),0);
 assert.equal(old.edit({tool:'erase',points:[[0,0,0]],eraseInvisible:true}).changes.length,3);
 assert.equal(old.at(0),0);
});

test('invisible selections move recorded air, keep absent destinations safe and retain sparse copy bounds',async()=>{
 const doc=await Structure.open(create([6,2,3]));
 const at=(x,y=0,z=0)=>doc.cell([x,y,z]);
 const write=(name,coords)=>doc.edit({tool:'fill',state:{name:'minecraft:'+name,props:{}},box:[coords,coords]});
 const name=c=>doc.state((doc.at(c)>>1)-1)?.name;
 write('cave_air',[0,0,0]);write('stone',[3,0,0]);
 const move={tool:'move',selection:[at(0),at(1)],delta:[2,0,0]};
 assert.throws(()=>doc.edit(move),/没有可变换/);
 const edit=doc.edit({...move,includeInvisible:true});assert.deepEqual(edit.selection,[at(2)]);
 assert.equal(name(at(0)),'minecraft:air');assert.equal(name(at(2)),'minecraft:cave_air');assert.equal(name(at(3)),'minecraft:stone');
 doc.apply(edit.changes,false,edit.tiles);assert.equal(name(at(0)),'minecraft:cave_air');assert.equal(name(at(2)),undefined);
 const holes=doc.edit({tool:'move',selection:[at(1)],delta:[1,0,0],includeInvisible:true});
 assert.equal(holes.changes.length,0);assert.deepEqual(holes.selection,[at(2)]);
 const rotate=doc.edit({tool:'rotate',selection:[at(0)],axis:1,pivot:[.5,.5,1.5],turns:2,includeInvisible:true});
 assert.deepEqual(rotate.selection,[at(0,0,2)]);assert.equal(name(at(0)),'minecraft:air');assert.equal(name(at(0,0,2)),'minecraft:cave_air');
 const clip=doc.copySelection([at(0,0,1),at(0,0,2)],0,true);
 assert.deepEqual(clip.size,[1,1,2]);assert.deepEqual(clip.blocks.map(b=>b.pos),[[0,0,1]]);
 assert.equal(clip.states[0].name,'minecraft:cave_air');
 const axes=[[1,0,0],[0,1,0],[0,0,1]];write('gold_block',[5,0,1]);write('stone',[5,0,2]);
 assert.throws(()=>doc.paste(clip,[5,0,1],axes),/已有方块/);
 doc.paste(clip,[5,0,1],axes,{moveOverwrite:true});assert.equal(name(at(5,0,1)),'minecraft:gold_block');assert.equal(name(at(5,0,2)),'minecraft:cave_air');
});

test('full SNBT edits validate the structure, round-trip compound data and reject stale drafts',async()=>{
 const raw=gzipSync(fixture()),doc=await Structure.open(raw),first=doc.snbt();
 assert.match(first.text,/"author": "Tester"/);assert.match(first.text,/"pos": \[0,0,0\]/);
 assert.deepEqual(await doc.serialize(),raw);
 const update=text=>doc.layout({kind:'snbt',palette:0,revision:first.revision,text});
 assert.equal(update(first.text),null);
 assert.throws(()=>update('['),/缺少/);
 assert.throws(()=>update('{}'),/size/);
 assert.throws(()=>update(first.text.replace('4438','5023')),/DataVersion/);
 const changed=update(first.text.replace('Tester','SNBT测试').replace('"Values":','"mixed": [1b,"str"],"Values":'));
 const next=await Structure.open(gzipSync(changed.raw));assert.match(next.snbt().text,/SNBT测试/);
 assert.match(next.tileValue(0,'Values').text,/459561500781L/);assert.equal(next.tileValue(0,'mixed').text,'[1b,"str"]');
 assert.deepEqual(next.size,doc.size);assert.equal(next.dv,doc.dv);assert.equal(next.entities,1);
 assert.throws(()=>next.layout({kind:'snbt',palette:0,...first}),/结构已有其他更改/);
});

test('box copy and local NBT export keep invisible layers, gaps and block entity data',async()=>{
 const d=await Structure.open(fixture(true));
 const region={lo:[0,0,0],hi:[2,2,1]};const top=[2,2,1];
 d.edit({tool:'fill',box:[top,top],state:{name:'minecraft:cave_air',props:{}},palette:1});
 d.edit({tool:'tile',cell:0,path:'LootTableSeed',text:'9223372036854775807L'});
 const clip=d.copySelection([0],1,false,region);assert.deepEqual(clip.size,[3,3,2]);
 const meta=clipThumb(clip);assert.equal(meta.thumb.length,1);
 assert.ok(meta.invisibleThumb.some(([x,y,z,id])=>y===2&&meta.states[id]?.name==='minecraft:cave_air'));
 assert.ok(meta.invisibleThumb.some(([x,y,z,id])=>id===-1));
 const actual=await Structure.open(gzipSync(clipBytes(clip))),name=p=>actual.state((actual.at(actual.cell(p))>>1)-1)?.name;
 assert.equal(actual.dv,d.dv);assert.deepEqual(actual.size,[3,3,2]);assert.equal(name(top),'minecraft:cave_air');
 assert.equal(name([1,0,0]),undefined);assert.equal(name([1,1,0]),undefined);assert.equal(name([2,0,0]),'minecraft:air');
 assert.equal(name([0,0,0]),'minecraft:barrel');assert.equal(actual.tileValue(0,'LootTableSeed').text,'9223372036854775807L');
});

test('entities preserve typed NBT, relocate with clips, and remain separate from blocks',async()=>{
 let s=await Structure.open(create([8,6,8]));
 const shape=()=>s.entityList()[0];
 const apply=q=>{const r=s.layout({...q,kind:'entity',palette:0});if(r)s=new Structure(null,r.raw,s.zip);};
 apply({action:'add',id:'minecraft:pig',summoned:summoned('minecraft:pig'),pos:[2.25,1,2.75]});
 apply({action:'nbt',index:0,revision:shape().revision,edits:[{path:'NoAI',text:'1b',expectedType:1},{path:'Rotation',text:'[90f,10f]',expectedType:9},{path:'Age',text:'-24000',expectedType:3}]});
 assert.equal(shape().baby,true);assert.deepEqual(shape().rotation,[90,10]);assert.match(s.entityDetails(0).text,/"NoAI":1b/);
 const rev=shape().revision;apply({action:'move',index:0,revision:rev,pos:[3.25,1,2.75]});
 assert.deepEqual(shape().pos,[3.25,1,2.75]);assert.throws(()=>apply({action:'move',index:0,revision:rev,pos:[2,2,2]}),/已变更/);
 s.edit({tool:'place',points:[[3,0,2]],state:{name:'minecraft:stone',props:{}}});
 const region={lo:[3,0,2],hi:[4,2,3]};assert.equal(s.copyEntities(region,true),1);
 const clip=s.copySelection([s.cell([3,0,2])],0,true,region,true),single=s.copyEntity(0);
 assert.equal(clip.entities.length,1);assert.equal(single.entityOnly,true);assert.deepEqual(clip.size,[2,3,2]);
 const d=await Structure.open(clipBytes(clip));assert.deepEqual(d.entityList()[0].pos,[.25,1,.75]);assert.equal(d.snapshot().visible,1);
 const axes=[[0,0,-1],[0,1,0],[1,0,0]];
 const pasted=await Structure.open(s.pasteEntities(clip,[5,0,5],axes));
 assert.deepEqual(pasted.entityList()[1].pos,[5.75,1,5.75]);assert.ok(Math.abs(pasted.entityList()[1].rotation[0])<.01);
 assert.throws(()=>s.pasteEntities(single,[7,7,7],axes),/边界/);
});

test('worker places optional entities atomically, then deletes just the selected entity with undo and redo',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'voxel_entity_test_')),file=path.join(root,'fixture.nbt');
 const src=await Structure.open(create([6,6,6]));
 const first=src.layout({kind:'entity',action:'add',id:'minecraft:pig',summoned:summoned('minecraft:pig'),pos:[.5,0,.5],palette:0});await writeFile(file,first.raw);
 const w=new Worker(path.join(__dirname,'../lib/worker.js'));let id=0;
 const call=(method,...args)=>new Promise((resolve,reject)=>{w.once('message',m=>m.error?reject(new Error(m.error)):resolve(m.result));w.postMessage({id:++id,method,args});});
 try{
  await call('load',file,null);
  const single=await call('copyEntity',0),base={tool:'paste',axes:[[1,0,0],[0,1,0],[0,0,1]],origin:[3,0,3],palette:0};
  const solid={...single,entityOnly:false,blocks:[{pos:[0,0,0],id:0,tile:null}],states:[{name:'minecraft:stone',props:{}}]};
  await call('edit',{...base,placeEntities:false},solid);assert.equal((await call('view',0)).entities,1);
  await assert.rejects(call('edit',{...base,placeEntities:true},solid),/已有方块/);assert.equal((await call('view',0)).entities,1);
  const paste=await call('edit',{...base,placeEntities:false},single);assert.ok(paste.token);assert.equal(paste.entityOnly,true);assert.equal((await call('view',0)).entities,2);
  await call('restoreLayout',paste.token,false);assert.equal((await call('view',0)).entities,1);
  await call('restoreLayout',paste.token,true);
  const before=await call('view',0),state=await call('save');assert.equal(before.entities,2);
  const remove={kind:'entity',action:'delete',index:0,revision:before.entityList[0].revision,palette:0};
  await assert.rejects(call('layout',{...remove,revision:'stale'}),/实体已变更/);
  const deletion=await call('layout',remove);assert.equal(deletion.entity,null);
  const {entities,entityList}=await call('entityRows');
  const {entities:_count,entityList:_list,...blocks}=await call('view',0);
  assert.equal(entities,1);assert.deepEqual(entityList,[{...before.entityList[1],index:0}]);
  assert.deepEqual(blocks,(({entities,entityList,...rest})=>rest)(before));
  await assert.rejects(call('layout',remove),/实体已变更/);
  await call('restoreLayout',deletion.token,false);assert.equal((await call('save')).hash,state.hash);
  await call('restoreLayout',deletion.token,true);assert.deepEqual((await call('view',0)).entityList,entityList);
 }finally{await w.terminate();await rm(root,{recursive:true,force:true});}
});


test('entity visual editor applies typed top-level patches without rewriting unrelated NBT',async()=>{
 const base=await Structure.open(create([4,4,4]));
 base.edit({tool:'place',points:[[0,0,0]],state:{name:'minecraft:stone',props:{}}});
 const d=await Structure.open(base.layout({kind:'entity',action:'add',id:'minecraft:armor_stand',summoned:summoned('minecraft:armor_stand'),pos:[1,1,1],palette:0}).raw);
 const {revision}=d.entityDetails(0);
 const edit=fields=>d.layout({kind:'entity',action:'nbt',index:0,revision,palette:0,fields});
 const r=edit([{key:'a.b:c',text:'{nested:[1b,"text",9223372036854775807L]}'},{key:'Motion',text:'[0.25d,0d,0d]'}]);
 const n=await Structure.open(r.raw);
 assert.match(n.entityDetails(0).text,/"a.b:c":\{"nested":\[1b,"text",9223372036854775807L\]\}/);
 assert.match(n.entityDetails(0).text,/"Motion":\[0.25d,0d,0d\]/);
 assert.equal(n.entityDetails(0).id,'minecraft:armor_stand');assert.deepEqual(d.snapshot().voxels,n.snapshot().voxels);
 assert.throws(()=>edit([{key:'Pos',text:'[2d,0d,0d]'}]),/位置栏/);
 assert.throws(()=>edit([{key:'x',text:'{bad'}]),/字符/);
 const del=n.layout({kind:'entity',action:'nbt',index:0,revision:n.entityDetails(0).revision,palette:0,fields:[{key:'a.b:c',remove:true}]});
 assert.doesNotMatch((await Structure.open(del.raw)).entityDetails(0).text,/a.b:c/);
});

test('reused vanilla summon process initializes fresh entities and worker stores them without UUID', {skip:!process.env.VOXEL_MASK_JAR,timeout:120000},async()=>{
 const {summonEntity,prepareSummon,stopSummon}=require('../lib/native-summon');
 const dir=await mkdtemp(path.join(tmpdir(),'voxel_native_summon_')),file=path.join(dir,'a.nbt');await writeFile(file,create([6,6,6]));
 const w=new Worker(path.join(__dirname,'../lib/worker.js'));let id=0;
 const call=(method,...args)=>new Promise((ok,fail)=>{w.once('message',m=>m.error?fail(new Error(m.error)):ok(m.result));w.postMessage({id:++id,method,args});});
 try{
  await call('load',file,null);const q={kind:'entity',action:'add',id:'minecraft:skeleton',pos:[2.25,1,3.5],palette:0};
  const jar=process.env.VOXEL_MASK_JAR;
  const priming=prepareSummon(jar);
  await assert.rejects(call('layout',q),/缺少原版/);
  const baseVersion=await call('entityBounds',q.pos),native=await summonEntity(jar,q.id,q.pos);
  const {session}=await priming;
  assert.equal((await prepareSummon(jar)).session,session);assert.equal(native.dv,baseVersion);
  const created=await call('layout',{...q,summoned:native.nbt});
  const info=await call('entityDetails',0);assert.deepEqual(info.pos,q.pos);
  assert.match(info.text,/"mainhand":\{"count":1,"id":"minecraft:bow"/);assert.match(info.text,/"Health":20f/);
  assert.match(info.text,/"id":"minecraft:random_spawn_bonus"/);assert.doesNotMatch(info.text,/"UUID":/);
  await assert.rejects(summonEntity(jar,'minecraft:this_entity_does_not_exist',q.pos),/没有实体/);
  await call('restoreLayout',created.token,false);assert.equal((await call('entityRows')).entities,0);
  await call('restoreLayout',created.token,true);assert.equal((await call('entityDetails',0)).text,info.text);
  await writeFile(file,fixture());await call('load',file,null);
  const pos=[2.75,1,2.5],second=await summonEntity(jar,q.id,pos);
  assert.equal((await prepareSummon(jar)).session,session);
  const mixed=await call('layout',{...q,pos,summoned:second.nbt});
  assert.equal(await call('entityBounds',pos),4438);
  const saved=await call('entityDetails',mixed.entity);assert.deepEqual(saved.pos,pos);assert.match(saved.text,/"id":"minecraft:bow"/);
  const specified=await summonEntity(jar,q.id,q.pos,'{NoAI:1b,Tags:["console custom data"],Health:3f}');
  const added=await call('layout',{...q,summoned:specified.nbt});
  const withData=await call('entityDetails',added.entity);
  assert.match(withData.text,/"NoAI":1b/);assert.match(withData.text,/"Health":3f/);assert.match(withData.text,/console custom data/);
  assert.doesNotMatch(withData.text,/minecraft:bow/);
  await assert.rejects(summonEntity(jar,q.id,q.pos,'{bad}'),/无法用 .*召唤/);
  if(process.env.VOXEL_SUMMON_OTHER_JAR){
   const other=await summonEntity(process.env.VOXEL_SUMMON_OTHER_JAR,q.id,q.pos);
   const edited=await call('layout',{...q,summoned:other.nbt});
   assert.notEqual(other.version,'26.3');assert.equal(await call('entityBounds',q.pos),4438);
   assert.match((await call('entityDetails',edited.entity)).text,/"id":"minecraft:bow"/);
   const otherCustom=await summonEntity(process.env.VOXEL_SUMMON_OTHER_JAR,q.id,q.pos,'{Tags:["console other jar"]}');
   assert.ok(Buffer.from(otherCustom.nbt).includes(Buffer.from('console other jar')));
  }
 }finally{await stopSummon();await w.terminate();if(path.dirname(dir)===path.resolve(tmpdir()))await rm(dir,{recursive:true,force:true});}
});


test('block entity visual list and namespaced keys apply atomically with undo and stale edit protection',async()=>{
 const d=await Structure.open(fixture()),c=0,before=Buffer.from(d.tileAt(c));
 const {revision}=d.tileInfo(c),items='[{Slot:0b,id:"minecraft:diamond",count:2},{Slot:3b,id:"minecraft:stick",count:1}]';
 const submit=fields=>d.edit({tool:'tile',cell:c,revision,fields});
 assert.throws(()=>submit([{key:'Items',text:items},{key:'x',text:'0'}]),/ID 和位置/);
 assert.deepEqual(d.tileAt(c),before);
 assert.throws(()=>submit([{key:'Values',text:'[]'}]),/标签类型改变/);
 const change=submit([{key:'Items',text:items},{key:'custom:data',text:'{count:1}'}]);
 assert.match(d.tileInfo(c).text,/"custom:data": \{/);
 assert.match(d.tileValue(c,'Items').text,/"Slot":3b/);
 assert.match(d.tileValue(c,'Items').text,/"count":2/);
 assert.equal(d.tileValue(c,'id').text,'"minecraft:chest"');
 assert.throws(()=>submit([{key:'Items',remove:true}]),/已变更/);
 d.apply(change.changes,false,change.tiles);assert.deepEqual(d.tileAt(c),before);
 d.apply(change.changes,true,change.tiles);assert.match(d.tileValue(c,'Items').text,/"id":"minecraft:diamond"/);
});


test('direct entity rotation only changes yaw, preserving pitch, position, UUID, and other fields',async()=>{
 let d=await Structure.open(create([4,4,4]));const id='minecraft:armor_stand',pos=[1.25,0,2.875];
 d=await Structure.open(d.layout({kind:'entity',action:'add',id,summoned:summoned(id),pos,palette:0}).raw);
 let revision=d.entityDetails(0).revision;
 d=await Structure.open(d.layout({kind:'entity',action:'nbt',index:0,revision,palette:0,text:'{id:"minecraft:armor_stand",UUID:[I;1,2,3,4],Tags:["preserve"],Rotation:[0f,34f]}'}).raw);
 revision=d.entityDetails(0).revision;
 const q={kind:'entity',action:'rotate',index:0,revision,palette:0,yaw:-92};
 assert.throws(()=>d.layout({...q,yaw:NaN}),/角度/);
 assert.throws(()=>d.layout({...q,yaw:181}),/角度/);
 assert.throws(()=>d.layout({...q,yaw:undefined,rotation:[-92,10]}),/角度/);
 assert.equal(d.layout({...q,yaw:0}),null);
 const after=await Structure.open(d.layout(q).raw);
 assert.deepEqual(after.entityList()[0].pos,pos);assert.deepEqual(after.entityList()[0].rotation,[-92,34]);
 assert.match(after.entityDetails(0).text,/"UUID":\[I;1,2,3,4\]/);assert.match(after.entityDetails(0).text,/"Tags":\["preserve"\]/);
 assert.throws(()=>after.layout(q),/已变更/);
});


test('box transformations only affect explicitly selected entities and preserve their membership across overlap, save and undo',async()=>{
 let d=await Structure.open(create([6,6,6]));const id='minecraft:pig',first=[1.25,1.25,1.5],bystander=[2.5,1.5,1.5],block=[1,1,1];
 d.edit({tool:'place',points:[block],state:{name:'minecraft:stone',props:{}}});
 for(const pos of [first,bystander])d=await Structure.open(d.layout({kind:'entity',action:'add',id,summoned:summoned(id),pos,palette:0}).raw);
 const ref=()=>d.entityList().slice(0,1).map(({index,revision})=>({index,revision}));const original=await d.serialize();
 const start=d.cell(block),end=d.cell([2,1,1]);
 const box={tool:'move',delta:[1,0,0],selection:[start]},move=d.edit({...box,entitySelection:ref()});
 assert.deepEqual(d.entityList().map(r=>r.pos),[[2.25,1.25,1.5],bystander]);
 const turn={tool:'rotate',axis:0,pivot:[2.5,1.5,1.5],turns:1,selection:[end]};
 assert.throws(()=>d.edit({...turn,entitySelection:ref()}),/仅可.*绕 Y/);
 assert.doesNotThrow(()=>d.edit(turn));
 const group=d.edit({...turn,axis:1,entitySelection:ref()});
 assert.deepEqual(d.entityList().map(r=>r.pos),[[2.5,1.25,1.75],bystander]);
 assert.equal(d.entityList()[0].rotation[0],-90);
 const region={lo:[2,1,1],hi:[2,1,1]},clip=d.copySelection([end],0,true,region,ref());assert.equal(clip.entities.length,1);
 assert.equal(d.copySelection([end],0,true,region,[]).entities.length,0);
 assert.equal((await Structure.open(await d.serialize())).entityList()[0].rotation[0],-90);
 d.apply(group.changes,false,group.tiles,group.added,group.entityChanges);d.apply(move.changes,false,move.tiles,move.added,move.entityChanges);
 assert.deepEqual(await d.serialize(),original);
 d.apply(move.changes,true,move.tiles,move.added,move.entityChanges);assert.deepEqual(d.entityList()[0].pos,[2.25,1.25,1.5]);
 const tilt=[[1,0,0],[0,0,1],[0,-1,0]],up=[[0,0,-1],[0,1,0],[1,0,0]];
 assert.throws(()=>d.pasteEntities(clip,[4,2,4],tilt),/仅可绕 Y/);
 assert.throws(()=>d.paste(clip,[4,2,4],tilt,{placeEntities:false}),/仅可绕 Y/);
 const pasted=await Structure.open(d.pasteEntities(clip,[4,2,4],up));
 assert.deepEqual(pasted.entityList()[2].rotation,[-180,0]);
 assert.doesNotThrow(()=>d.paste({...clip,entities:[]},[4,2,4],tilt));
});


test('entities with fixed or cardinal visuals cannot freely rotate, even though their groups still can',async()=>{
 let d=await Structure.open(create([8,5,8]));const pos=[2.5,1,2.5];
 for(const type of ['cushion','end_crystal','frog']){
  const id='minecraft:'+type;
  d=await Structure.open(d.layout({kind:'entity',action:'add',id,summoned:summoned(id),pos,palette:0}).raw);
 }
 assert.deepEqual(d.entityList().map(r=>r.rotationMode),['cardinal','fixed','free']);
 for(const {index,revision,rotationMode} of d.entityList()){
  const edit={kind:'entity',action:'rotate',index,revision,yaw:30,palette:0};
  if(rotationMode==='free')assert.ok(d.layout(edit));else assert.throws(()=>d.layout(edit),/不支持连续旋转/);
 }
 const rows=d.entityList(),rotated=d.edit({tool:'rotate',selection:[],entitySelection:rows,axis:1,turns:1,pivot:[3,1,3]});
 assert.equal(rotated.entityChanges.length,3);
 assert.deepEqual(d.entityList().map(r=>r.pos),[[2.5,1,3.5],[2.5,1,3.5],[2.5,1,3.5]]);
 assert.deepEqual(d.entityList().map(r=>r.rotation[0]),[-90,0,-90]);
});


test('hanging entities keep variant, item rotation and mount direction in copied templates',async()=>{
 let doc=await Structure.open(create([12,12,12]));
 const pos=[2.5,3.5,4.03125],frame=[3.5,3.03125,4.5];
 for(const [index,id,p,text] of [
  [0,'minecraft:painting',pos,'{id:"minecraft:painting",variant:"minecraft:pointer",facing:0b}'],
  [1,'minecraft:glow_item_frame',frame,'{id:"minecraft:glow_item_frame",Facing:1b,Item:{id:"minecraft:diamond_sword",count:1},ItemRotation:6b,Invisible:1b}'],
 ]){
  doc=await Structure.open(doc.layout({kind:'entity',action:'add',pos:p,id,summoned:summoned(id),palette:0}).raw);
  doc=await Structure.open(doc.layout({kind:'entity',action:'nbt',index,revision:doc.entityDetails(index).revision,text,palette:0}).raw);
 }
 const rows=doc.entityList();assert.deepEqual(rows[0].hanging,{facing:3,art:'minecraft:pointer'});
 assert.deepEqual(rows[1].hanging,{facing:1,item:'minecraft:diamond_sword',spin:6});assert.equal(rows[1].invisible,true);
 const clip={entities:doc.entityEntries()};
 const axes=[[0,0,-1],[0,1,0],[1,0,0]],result=await Structure.open(doc.pasteEntities(clip,[0,0,8],axes));
 assert.deepEqual(result.entityList()[2].hanging,{art:'minecraft:pointer',facing:5});
 assert.deepEqual(result.entityList()[3].hanging,rows[1].hanging);
});

test('keep on coordinate box edits protects existing blocks and is undoable',async()=>{
 const d=await Structure.open(create([4,3,3])),a=[1,1,1],b=[2,1,1];
 d.edit({tool:'place',points:[a],state:{name:'minecraft:stone',props:{}}});
 const r=d.edit({tool:'fill',box:[a,b],state:{name:'minecraft:glass',props:{}},keepExisting:true});
 assert.equal(d.state((d.at(d.cell(a))>>1)-1).name,'minecraft:stone');
 assert.equal(d.state((d.at(d.cell(b))>>1)-1).name,'minecraft:glass');
 d.apply(r.changes,false,r.tiles,r.added);assert.equal(d.at(d.cell(b)),0);
});

test('command fill places shells, explicit air, and filters old block states with defaults',async()=>{
 const doc=await Structure.open(create([5,5,5]));
 const command=(box,name,commandMode,opts={})=>doc.edit({tool:'fill',box,state:{name:'minecraft:'+name,props:{}},commandMode,...opts});
 const name=p=>doc.state((doc.at(doc.cell(p))>>1)-1)?.name;
 const cube=[[3,3,3],[1,1,1]],inside=[2,2,2],outer=[1,2,2];
 command([inside,inside],'oak_log','replace');
 command(cube,'stone','outline');assert.equal(name(inside),'minecraft:oak_log');assert.equal(name(outer),'minecraft:stone');
 command(cube,'glass','hollow',{blockFilter:{name:'minecraft:oak_log',props:{axis:'y'}}});
 assert.equal(name(inside),'minecraft:air');assert.equal(name(outer),'minecraft:stone');
 const r=command([[0,0,0],[4,4,4]],'gold_block','hollow');assert.equal(name(outer),'minecraft:air');assert.equal(name([4,4,4]),'minecraft:gold_block');
 doc.apply(r.changes,false,r.tiles,r.added);assert.equal(name(outer),'minecraft:stone');
 doc.apply(r.changes,true,r.tiles,r.added);assert.equal(name(outer),'minecraft:air');
 assert.throws(()=>command(cube,'dirt','strict',{blockFilter:{name:'minecraft:diamond_block',props:{}}}),/未改变/);
 const empty=await Structure.open(create([3,3,3]));
 const shell=empty.edit({tool:'fill',box:[[0,0,0],[2,2,2]],state:{name:'minecraft:stone'},commandMode:'hollow'});
 assert.equal(shell.added.length,2);
 assert.equal(empty.state((empty.at(empty.cell([1,1,1]))>>1)-1).name,'minecraft:air');
});

test('command SNBT is atomic, matches typed subsets and survives save and undo',async()=>{
 const doc=await Structure.open(create([3,3,3]));const pos=[1,1,1],cell=doc.cell(pos);
 const chest={tool:'fill',box:[pos,pos],state:{name:'minecraft:chest',props:{facing:'west'}},commandMode:'replace'};
 doc.edit({...chest,snbt:'{id:"minecraft:furnace",x:123,Items:[{Slot:0b,id:"minecraft:apple",count:3}],CustomName:"Hello world"}'});
 const initial=await doc.serialize();const reopened=await Structure.open(initial);
 assert.equal(reopened.blockData(cell).id,'minecraft:chest');assert.equal(reopened.tileValue(cell,'x'),null);
 assert.equal(reopened.tileValue(cell,'CustomName').text,'"Hello world"');
 const update=doc.edit({...chest,snbt:'{CustomName:"Updated"}'});
 assert.equal(doc.tileValue(cell,'CustomName').text,'"Updated"');
 doc.apply(update.changes,false,update.tiles,update.added);assert.deepEqual(await doc.serialize(),initial);
 const filtered={...chest,state:{name:'minecraft:stone'},commandMode:'destroy',allowNbt:true,blockFilter:{name:'minecraft:chest',props:{facing:'west'},snbt:'{Items:[{count:3b}]}'} };
 assert.throws(()=>doc.edit(filtered),/未改变/);assert.deepEqual(await doc.serialize(),initial);
 assert.throws(()=>doc.edit({...chest,snbt:'{broken:}'}),/缺少/);
 assert.throws(()=>doc.edit({...chest,state:{name:'minecraft:stone'},snbt:'{}'}),/不支持/);
 assert.deepEqual(await doc.serialize(),initial);
 assert.throws(()=>doc.edit({...chest,commandMode:'destroy'}),/受保护/);
 const destroy=doc.edit({...filtered,blockFilter:{...filtered.blockFilter,snbt:'{Items:[{count:3}]}'}});
 assert.equal(doc.blockData(cell),null);doc.apply(destroy.changes,false,destroy.tiles,destroy.added);assert.equal(doc.tileValue(cell,'CustomName').text,'"Hello world"');
});
