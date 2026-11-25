'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

test('chunk meshes reuse their byte budget when a buffer is replaced or removed',async()=>{
  const {createChunkMeshes}=await import('../media/scene-renderer.js');
  const created=[],deleted=[];
  const gl={createBuffer:()=>{const id=created.length+1;created.push(id);return id;},deleteBuffer:id=>deleted.push(id),bindBuffer(){},bufferData(){}};
  const mesh=createChunkMeshes(gl,64),quad=new Float32Array(8),empty=new Float32Array();
  assert.equal(mesh.replace('1,2,3',quad,quad),false);
  assert.equal(mesh.replace('0,0,0',quad,empty),true);
  assert.deepEqual([...mesh.values()].map(({alpha,center})=>({alpha,center})),[
    {alpha:false,center:[24,40,56]},{alpha:true,center:[24,40,56]},
  ]);
  assert.equal(mesh.replace('1,2,3',empty,quad),false);
  assert.deepEqual(deleted,[1,2]);
  assert.equal(mesh.replace('0,0,0',quad,empty),false);
  mesh.clear();
  assert.deepEqual([...mesh.values()],[]);
  assert.deepEqual(deleted,created);
});
