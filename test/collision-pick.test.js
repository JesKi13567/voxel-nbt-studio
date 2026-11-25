'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const js=import('../media/collision-pick.js');
const full=[0,0,0,1,1,1],carpet=[0,0,0,1,1/16,1],pane=[.4375,0,.4375,.5625,1,.5625],fence=[.375,0,.375,.625,1.5,.625];
const shapes={shapes:[full,carpet,pane,fence,[]],blocks:{'minecraft:stone':0,'minecraft:moss_carpet':1,'minecraft:glass_pane':2,'minecraft:oak_fence':3,'minecraft:torch':4}};
const state=(name,props={})=>({name:'minecraft:'+name,props});

test('pick goes past the empty part of a carpet or glass pane and still hits their actual bounds',async()=>{
 const {collisionIndex,traceCollision,hitCollision}=await js,index=collisionIndex(shapes);
 const surface=hitCollision([.5,1/16,.5],[0,-1,0],[0,0,0],carpet);assert.deepEqual(surface.n,[0,1,0]);
 const trace=(name,height,z)=>traceCollision({eye:[1.9,height,z],d:[-1,0,0]},[3,2,1],index,([x,y])=>y===0?index.shape(state(x===1?name:x===0?'stone':'air')):null);
 for(const [name,height,z] of [['moss_carpet',.21,.5],['glass_pane',.5,.8],['torch',.5,.5]])assert.deepEqual(trace(name,height,z).p,[0,0,0]);
 assert.deepEqual(trace('moss_carpet',.03,.5).p,[1,0,0]);
 assert.deepEqual(trace('glass_pane',.5,.5).p,[1,0,0]);
 const hit=traceCollision({eye:[2,1.25,.5],d:[-1,0,0]},[1,1,1],index,()=>fence);
 assert.deepEqual(hit.p,[0,0,0]);assert.equal(hit.distance,1.375);assert.deepEqual(hit.n,[1,0,0]);
});

test('native collision takes priority; plants, crops, fixtures and thin decorations use their outlines',{skip:!process.env.VOXEL_MASK_JAR,timeout:90000},async()=>{
 const d=await require('../lib/native-summon').collisionShapes(process.env.VOXEL_MASK_JAR);
 const {collisionIndex,hitCollision}=await js,index=collisionIndex(d);
 assert.deepEqual(index.shape(state('moss_carpet')),carpet);assert.deepEqual(index.shape(state('mud_bricks')),full);
 assert.deepEqual(index.shape(state('torch')),[.375,0,.375,.625,.625,.625]);
 const flower=index.shape(state('torchflower'));
 assert.deepEqual(flower,[.3125,0,.3125,.6875,.625,.6875]);
 assert.ok(hitCollision([2.5,3,2.5],[0,-1,0],[2,1,2],flower));
 assert.equal(hitCollision([2.82,3,2.82],[0,-1,0],[2,1,2],flower),null);
 for(const [id,props] of [['short_grass',{}],['pink_petals',{}],['vine',{north:'true'}],['wheat',{age:'7'}],['redstone_wire',{}],['rail',{}],['wall_torch',{facing:'east'}],['lever',{}],['pale_hanging_moss',{}]])
  assert.ok(index.shape(state(id,props))?.length>=6,id);
 for(const id of ['air','cave_air','void_air','water','lava','bubble_column','light','moving_piston'])assert.deepEqual(index.shape(state(id)),[],id);
 assert.deepEqual(index.shape(state('barrier')),full);
 const ray=[[.9,.5,.2],[0,0,1],[0,0,0]];
 assert.equal(hitCollision(...ray,index.shape(state('magenta_stained_glass_pane'))),null);
 assert.ok(hitCollision(...ray,index.shape(state('magenta_stained_glass_pane',{east:'true'}))));
});
