'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,readFile,readdir,writeFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join,dirname,basename,resolve}=require('node:path');
const {Document,atomicFile}=require('../lib/document');
const {Structure,create}=require('../lib/nbt');

test('document owns its edit queue and detects disk conflicts without leaking a temporary file',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'voxel_doc_test_'));
  const file=join(temp,'sample.nbt');
  let doc;
  try{
    await writeFile(file,create([2,2,2]));
    doc=new Document({scheme:'file',fsPath:file},file,null);
    await doc.ready;
    const invalid=doc.run(()=>doc.call('unknown'));
    const edit=doc.run(()=>doc.call('edit',{tool:'fill',box:[[0,0,0],[1,1,1]],state:{name:'minecraft:stone'}}));
    await assert.rejects(invalid,/未知请求/);
    await edit;
    const {data}=await doc.call('save');
    assert.equal((await Structure.open(data)).snapshot().visible,8);
    assert.equal((await Structure.open(await readFile(file))).snapshot().visible,0);
    await atomicFile(file,data,doc.disk);
    await assert.rejects(atomicFile(file,create([1,1,1]),doc.disk),/外部修改/);
    assert.deepEqual(await readdir(temp),['sample.nbt']);
    assert.deepEqual(await readFile(file),Buffer.from(data));
  }finally{
    doc?.dispose();
    const target=resolve(temp);
    if(dirname(target)===resolve(tmpdir())&&basename(target).startsWith('voxel_doc_test_'))await rm(target,{recursive:true,force:true,maxRetries:3});
  }
});
