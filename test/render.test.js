'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function mesher(){
 const replies=[],timers=[],context=vm.createContext({postMessage:m=>replies.push(m),performance,setTimeout:f=>timers.push(f),atob});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../media/mesh.js'),'utf8'),context);
 return packet=>{context.onmessage({data:packet});while(timers.length)timers.shift()();return replies.splice(0);};
}
test('game-style mesh uses directional light and contact shadow while smooth mode stays unchanged',()=>{
 const send=mesher(),template={type:'blueprintMesh',id:1,size:[3,3,3],states:[{name:'minecraft:stone',props:{}}],colors:[[1,1,1]],blocks:[[0,0,0,0],[1,1,0,0]],styles:[],fluidUV:{}};
 const top=data=>Array.from({length:6},(_,i)=>data[2*6*8+i*8+3]);
 const flat=send(template)[0].vertices,game=send({...template,game:true})[0].vertices;
 assert.deepEqual(top(flat),[1,1,1,1,1,1]);
 assert.ok(top(game).some(n=>n<.9));assert.ok(top(game).some(n=>n===1));
 assert.ok(Math.abs(flat[3]-.81)<.00001);assert.ok(Math.abs(game[3]-.6)<.00001);
});
test('game lighting rebuilds the diagonally neighboring chunk after an edit',()=>{
 const send=mesher(),size=[17,17,17],cell=(x,y,z)=>x+17*(z+17*y),base64=(...v)=>Buffer.from(Uint32Array.from(v).buffer).toString('base64');
 send({type:'model',model:1,epoch:1,mode:'full',layer:0,size,voxels:base64(cell(15,15,15),2),states:[{name:'minecraft:stone',props:{}}],colors:[[1,1,1]]});
 send({type:'lighting',model:1,epoch:2,game:true});
 const result=send({type:'patch',model:1,data:base64(cell(16,16,16),2)});
 assert.ok(result.flatMap(m=>m.output).some(m=>m.key==='0,0,0'&&m.mesh.length>0));
});

test('selection segments keep scene depth and clip at the near and side planes',async()=>{
 const {clipPoint,clipSegment}=await import('../media/box-projection.js');
 const projection=[1.2,0,0,0,0,2,0,0,0,0,-101/99,-1,0,0,-200/99,0];
 const project=p=>clipPoint(projection,p),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
 const crossing=clipSegment(project([0,0,1]),project([.8,.5,-4]));
 assert.ok(crossing);close(crossing[0][2],-1);close(crossing[1][0],.24);close(crossing[1][1],.25);assert.ok(crossing[1][2]>0);
 assert.equal(clipSegment(project([0,0,1]),project([1,0,2])),null);
 const wide=clipSegment(project([-100,0,-3]),project([100,0,-3]));close(wide[0][0],-1);close(wide[1][0],1);close(wide[0][2],wide[1][2]);
});

test('container atlas keeps 64 texels while ordinary blocks keep their existing 32 texels',async()=>{
 const {Materials}=await import('../media/materials.js');
 const m=Object.create(Materials.prototype);Object.assign(m,{side:128,tile:32,across:4,nextTile:1,nextContainer:0,slots:new Map(),pending:new Set(),jobs:[],pump(){},root:'assets'});
 const a=m.uv('minecraft:block/stone'),b=m.uv('minecraft:entity/chest/copper'),c=m.uv('minecraft:entity/shulker/shulker');
 assert.deepEqual(a,[.25,0,.5,.25]);assert.deepEqual(b,[0,.5,.5,1]);assert.deepEqual(c,[.5,.5,1,1]);
 assert.deepEqual(m.jobs.map(job=>job.pixels),[32,64,64]);
 assert.deepEqual(m.uv('minecraft:entity/chest/copper'),b);assert.equal(m.jobs.length,3);
 for(let i=0;i<6;i++)m.uv('minecraft:block/example_'+i);
 assert.deepEqual(m.uv('minecraft:block/overflow'),[0,0,.25,.25]);
 assert.ok(m.jobs.filter(j=>j.pixels===32).every(j=>j.y<64));
});

test('container preview uses original left/right geometry, texture variants and shulker facing',async()=>{
 const originalFetch=global.fetch;global.fetch=async url=>({ok:true,json:async()=>{
  assert.equal(path.basename(url.pathname),'container-models.json');return require('../media/container-models.json');
 }});
 try{
  const {Materials}=await import('../media/materials.js');
  const textures=[],app={uv(k){textures.push(k);return [.125,.25,.25,.375];}};
  const bake=(name,props)=>Materials.prototype.bake.call(app,{name:'minecraft:'+name,props});
  const left=await bake('waxed_exposed_copper_chest',{facing:'north',type:'left'}),right=await bake('waxed_exposed_copper_chest',{facing:'north',type:'right'});
  const xs=m=>m.quads.flatMap(q=>q.v.filter((_,i)=>i%8===0));
  assert.equal(Math.max(...xs(left)),1);assert.equal(Math.min(...xs(right)),0);assert.equal(left.quads.length,15);assert.equal(right.quads.length,15);
  const plain=await bake('shulker_box',{facing:'up'}),red=await bake('red_shulker_box',{facing:'east'});
  assert.equal(plain.quads.length,12);assert.equal(red.quads.length,12);assert.notDeepEqual(plain.quads,red.quads);
  const seamIntervals=model=>model.quads.filter(q=>q.face===4).map(q=>{
   const axis=n=>q.v.filter((_,i)=>i%8===n);return [Math.min(...axis(1)),Math.max(...axis(1)),axis(2)[0]];
  });
  const [lid,body]=seamIntervals(plain);assert.ok(lid[0]<body[1]&&lid[2]>body[2],'the closed lid and body must not fight on the same depth plane');
  const front=await bake('copper_chest',{facing:'south'});assert.ok(Math.max(...seamIntervals(front).map(row=>row[2]))===1,'the copper latch must protrude on the south face');
  const lighting=mesher()({type:'blueprintMesh',size:[1,1,1],states:[{name:'minecraft:copper_chest',props:{}}],blocks:[[0,0,0,0]],styles:[front],colors:[[1,1,1]],fluidUV:{},game:true})[0].vertices;
  for(const [i,q] of front.quads.entries())if(q.face===0||q.face===1)assert.ok(Math.abs(lighting[i*48+3]-.6)<1e-5,'opposite side faces must have equal illumination in game style');
  assert.deepEqual(textures,['minecraft:entity/chest/copper_exposed_left','minecraft:entity/chest/copper_exposed_right','minecraft:entity/shulker/shulker','minecraft:entity/shulker/shulker_red','minecraft:entity/chest/copper']);
 }finally{global.fetch=originalFetch;}
});


test('invisible wire cubes distinguish unwritten cells from air records, respect layers and update after editing',async()=>{
 const {Structure,create}=require('../lib/nbt'),doc=await Structure.open(create([6,2,1])),send=mesher();
 for(const [x,name] of ['air','cave_air','void_air',null,'stone'].entries())if(name)doc.edit({tool:'fill',box:[[x,0,0],[x,0,0]],state:{name:'minecraft:'+name,props:{}}});
 const snap=doc.snapshot(),buffer=Buffer.from(snap.maskCells,'base64'),maskCells=Array.from({length:buffer.length/4},(_,i)=>buffer.readUInt32LE(i*4));
 assert.equal(snap.visible,1);assert.equal(maskCells.length,6);
 // An explicit structure_void saved by an older editor must match the unrecorded cell.
 maskCells.push(3,(snap.states.push({name:'minecraft:structure_void',props:{}}))*2);
 const result=send({type:'model',model:1,epoch:1,mode:'single',layer:0,...snap,maskCells,colors:snap.states.map(()=>[1,1,1])});
 assert.equal(result.some(m=>m.type==='invisibleMesh'),false);
 const markers=output=>output.find(m=>m.type==='invisibleMesh').vertices;
 const data=markers(send({type:'invisible',show:true,model:1}));assert.equal(data.length,5*192);
 const color=i=>Array.from(data.slice(i*192+3,i*192+6));
 assert.ok(color(0)[0]>color(0)[1]&&color(0)[2]===1);
 assert.deepEqual(color(0),color(1));assert.deepEqual(color(1),color(2));
 assert.deepEqual(color(3),[1,.25,.25]);assert.deepEqual(color(4),color(3));
 assert.equal(data[0],.375);assert.equal(data[3*192],3.4375);assert.equal(data[4*192],5.4375);
 const upstairs=markers(send({type:'slice',model:1,epoch:2,mode:'single',layer:1}));assert.equal(upstairs.length,6*192);assert.equal(upstairs[1],1.4375);
 const patch=Buffer.from(Uint32Array.of(6,2).buffer).toString('base64');assert.equal(markers(send({type:'patch',model:1,data:patch}))[0],.375);
 send({type:'invisible',show:false,model:1});assert.equal(send({type:'patch',model:1,data:patch}).some(m=>m.type==='invisibleMesh'),false);
});

test('sampled markers do not miss a large resized shell or original holes',async()=>{
 const {Structure,create}=require('../lib/nbt'),doc=await Structure.open(create([6,40,40])),send=mesher();
 const grown=await Structure.open(doc.layout({kind:'size',size:[32,40,40],palette:0}).raw),snap=grown.snapshot();
 const packed=Buffer.from(snap.maskCells,'base64'),maskCells=new Uint32Array(packed.length/4);for(let i=0;i<maskCells.length;i++)maskCells[i]=packed.readUInt32LE(i*4);
 const {vertices,sampled}=send({type:'model',model:1,epoch:1,mode:'full',layer:0,...snap,maskCells,showInvisible:true,colors:snap.states.map(()=>[1,1,1])}).find(m=>m.type==='invisibleMesh');
 assert.equal(sampled,true);assert.equal(vertices.length,32768*192);
 let air=0,empty=0;
 for(let i=0;i<vertices.length;i+=192){if(vertices[i+5]===1){air++;assert.ok(vertices[i]>=6);}else{empty++;assert.ok(vertices[i]<6);}}
 assert.ok(air>0&&empty>0);
});

test('erase updates red markers during the stroke, restores them on cancel and keeps them on commit',()=>{
 const send=mesher(),base64=(...v)=>Buffer.from(Uint32Array.from(v).buffer).toString('base64');
 const marks=list=>{
  const {vertices}=list.find(m=>m.type==='invisibleMesh'),rows=[];
  for(let i=0;i<vertices.length;i+=192)rows.push([Math.floor(vertices[i]),vertices[i+5]===1?'air':'hole']);
  return rows.sort((a,b)=>a[0]-b[0]);
 };
 const model={type:'model',model:1,epoch:1,mode:'full',layer:0,size:[4,1,1],voxels:base64(0,2,2,2),maskCells:[1,4],
  states:[{name:'minecraft:stone'},{name:'minecraft:air'}],colors:[[1,1,1],[1,1,1]],showInvisible:true};
 const base=[[1,'air'],[3,'hole']];assert.deepEqual(marks(send(model)),base);
 const brush=data=>send({type:'brushPreview',model:1,data}),clear=()=>send({type:'brushClear',model:1});
 assert.deepEqual(marks(brush([0,0])),[[0,'hole'],...base]);
 const swept=[[0,'hole'],[1,'hole'],[2,'hole'],[3,'hole']];
 assert.deepEqual(marks(brush([1,0,2,0])),swept);
 assert.deepEqual(marks(clear()),base);
 brush([0,0,1,0,2,0]);
 assert.deepEqual(marks(send({type:'patch',model:1,data:base64(0,0,1,0,2,0)})),swept);
 assert.deepEqual(marks(clear()),swept);
});

test('live transform moves the mesh and marks the source as air, then restores or commits it',()=>{
 const send=mesher(),base64=(...v)=>Buffer.from(Uint32Array.from(v).buffer).toString('base64');
 const model={type:'model',model:1,epoch:1,mode:'full',layer:0,size:[5,1,1],voxels:base64(0,2),
  states:[{name:'minecraft:stone'},{name:'minecraft:air'}],colors:[[1,1,1],[1,1,1]],showInvisible:true};
 const lowX=pack=>{const data=pack.find(m=>m.type==='meshes').output[0].mesh;let n=Infinity;for(let i=0;i<data.length;i+=8)n=Math.min(n,data[i]);return n;};
 const isAir=(pack,x)=>{const data=pack.find(m=>m.type==='invisibleMesh').vertices;for(let i=0;i<data.length;i+=192)if(Math.floor(data[i])===x)return data[i+5]===1;return false;};
 const preview=x=>send({type:'transformPreview',model:1,data:[0,65538,x,2]});
 const clear=()=>send({type:'brushClear',model:1});
 assert.equal(lowX(send(model)),0);
 const first=preview(2);assert.equal(lowX(first),2);assert.equal(isAir(first,0),true);
 assert.equal(lowX(preview(3)),3);assert.equal(lowX(clear()),0);
 preview(3);send({type:'patch',model:1,data:base64(0,4,3,2)});
 assert.equal(lowX(clear()),3);
});

test('entity geometry and ray selection use fixed axis-aligned dimensions, even at an oblique yaw',async()=>{
 const {entityBox,rayBox}=await import('../media/entities.js');
 const id='minecraft:frog',sizes={[id]:[.5,.5]},row={id,pos:[5.5,2,4.25]},fixed={lo:[5.25,2,4],hi:[5.75,2.5,4.5]};
 for(const rotation of [[0,0],[45,0],[90,60],[-135,-30]]){
  const {lo,hi}=entityBox({...row,rotation},sizes);assert.deepEqual({lo,hi},fixed);
  assert.equal(rayBox({eye:[4,2.25,4.25],d:[1,0,0]},lo,hi),1.25);
  assert.equal(rayBox({eye:[4,2.25,4.6],d:[1,0,0]},lo,hi),Infinity);
 }
 assert.deepEqual(entityBox({...row,pos:[6.5,3,5.25]},sizes),{lo:[6.25,3,5],hi:[6.75,3.5,5.5]});
});

test('model orientation obeys cardinal and fixed rules without affecting ordinary yaw',async()=>{
 const {entityModelAxes}=await import('../media/entities.js');
 const axis=rotation=>entityModelAxes({rotation,rotationMode:'cardinal'});
 assert.deepEqual(axis([25,40]),axis([0,0]));assert.deepEqual(axis([-45,0]),axis([0,0]));
 assert.deepEqual(axis([60,15]),axis([90,0]));assert.deepEqual(axis([449,-35]),axis([90,0]));
 const rotatedTemplate=[[0,0,-1],[0,1,0],[1,0,0]];
 assert.deepEqual(entityModelAxes({rotation:[35,20],rotationMode:'fixed'},rotatedTemplate),entityModelAxes({rotation:[0,0]}));
 assert.notDeepEqual(entityModelAxes({rotation:[25,0]}),entityModelAxes({rotation:[0,0]}));
 assert.notDeepEqual(entityModelAxes({rotation:[0,0],rotationMode:'cardinal'},rotatedTemplate),axis([0,0]));
});

test('hanging entity bounds use variant size and actual wall, floor or ceiling direction',async()=>{
 const {entityBox,entityModelAxes}=await import('../media/entities.js');
 const base={pos:[4,5,6],rotation:[0,0],rotationMode:'hanging'};
 const painting={...base,hanging:{art:'minecraft:pointer',facing:2}},model={half:[2,2,1/32]};
 assert.deepEqual(entityBox(painting,null,model),{lo:[2,3,6-1/32],hi:[6,7,6+1/32]});
 const floor={...base,hanging:{facing:1,item:'minecraft:filled_map'}};
 assert.deepEqual(entityBox(floor),{lo:[3.5,5-1/32,5.5],hi:[4.5,5+1/32,6.5]});
 const rotated=entityModelAxes(painting,[[0,0,-1],[0,1,0],[1,0,0]]);
 assert.deepEqual(rotated[2],[1,0,0]);
});

test('entity catalog covers each 26.3 type with a native model or an explicit fallback', {skip:!process.env.VOXEL_MASK_JAR},async()=>{
 const d=await require('../lib/mask-java').entityModels(process.env.VOXEL_MASK_JAR);
 for(const type of Object.keys(d.sizes))assert.notEqual(!!d.models[type],!!d.unsupported[type],type);
 for(const [type,parts] of Object.entries(d.models))for(const part of parts){
  assert.ok(part.texture&&part.vertices.length>=48,`${type} requires a native model and texture`);
  assert.equal(part.vertices.length%48,0);assert.ok(part.vertices.every(Number.isFinite));
  for(let i=6;i<part.vertices.length;i+=8){assert.ok(Math.abs(part.vertices[i])<4,type+' U');assert.ok(Math.abs(part.vertices[i+1])<4,type+' V');}
 }
 const expected={sniffer:'sniffer/sniffer','sniffer#baby':'sniffer/snifflet',pig:'pig/pig_temperate','pig#cold#baby':'pig/pig_cold_baby',
  oak_boat:'boat/oak',cherry_chest_boat:'chest_boat/cherry',bamboo_raft:'boat/bamboo',bamboo_chest_raft:'chest_boat/bamboo',cushion:'cushion/white_cushion'};
 for(const [id,texture] of Object.entries(expected))assert.equal(d.models['minecraft:'+id]?.[0]?.texture,texture,id);
 assert.equal(d.cushionTextures.red,'cushion/red_cushion');assert.equal(Object.keys(d.cushionTextures).length,16);
 assert.ok(d.models['minecraft:pig#cold'][0].vertices.length>d.models['minecraft:pig'][0].vertices.length,'cold pig uses a different model, not only a skin');
 assert.ok(d.models['minecraft:slime'].some(layer=>layer.translucent));
 assert.ok(d.models['minecraft:sniffer'][0].vertices.some((v,i)=>i%8===6&&v>1),'retain native out-of-range UVs for repeated sampling');
 assert.equal(d.models['minecraft:experience_orb']?.[0]?.texture,'experience/experience_orb');
 assert.equal(d.models['minecraft:evoker_fangs']?.[0]?.texture,'illager/evoker_fangs');
 assert.deepEqual(d.sizes['minecraft:frog'],[.5,.5]);
 assert.ok(d.sizes['minecraft:pig'][1]>.5&&d.sizes['minecraft:zombie'][1]>1.5);
});
