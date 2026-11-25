'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,readFile,rm}=require('node:fs/promises'),{tmpdir}=require('node:os'),path=require('node:path');
const {entityModels}=require('../lib/mask-java'),{jarFolder}=require('../lib/assets'),{Structure,create}=require('../lib/nbt');
const jar=process.env.VOXEL_MASK_JAR;
const {serveWebview,launchBrowser}=require('./webview-harness.cjs');
const examples=[
 ['sniffer',[2.5,1,2.5],'{id:"minecraft:sniffer",Rotation:[45f,0f]}','sniffer/sniffer'],
 ['sniffer',[5.5,1,2.5],'{id:"minecraft:sniffer",Age:-24000,Rotation:[-30f,0f]}','sniffer/snifflet'],
 ['oak_boat',[8.5,1,2.5],'{id:"minecraft:oak_boat",Rotation:[15f,0f]}','boat/oak'],
 ['cherry_chest_boat',[2.5,1,5.5],'{id:"minecraft:cherry_chest_boat"}','chest_boat/cherry'],
 ['bamboo_raft',[5.5,1,5.5],'{id:"minecraft:bamboo_raft"}','boat/bamboo'],
 ['cushion',[8.5,1,5.5],'{id:"minecraft:cushion",color:"red"}','cushion/red_cushion'],
 ['pig',[2.5,1,8.5],'{id:"minecraft:pig",variant:"minecraft:cold"}','pig/pig_cold'],
 ['frog',[5.5,1,8.5],'{id:"minecraft:frog",variant:"minecraft:warm"}','frog/frog_warm'],
 ['slime',[8.5,1,8.5],'{id:"minecraft:slime"}','slime/slime'],
 ['mannequin',[5.5,1,1.5],'{id:"minecraft:mannequin",profile:{texture:"minecraft:entity/player/wide/ari",model:"wide"}}','player/wide/ari'],
 ['mannequin',[5.5,1,9.5],'{id:"minecraft:mannequin",profile:"TestPlayer"}','mock/remote_skin'],
 ['painting',[3.5,2.5,6.03],'{id:"minecraft:painting",facing:0b,variant:"minecraft:pointer"}','painting/pointer'],
 ['item_frame',[6.03125,1.5,6.5],'{id:"minecraft:item_frame",Facing:5b,Item:{id:"minecraft:diamond_sword",count:1},ItemRotation:3b}','block/item_frame'],
 ['glow_item_frame',[8.5,1.03125,8.5],'{id:"minecraft:glow_item_frame",Facing:1b,Item:{id:"minecraft:stone",count:1}}','block/glow_item_frame'],
 ['item_frame',[6.5,1.5,9.03125],'{id:"minecraft:item_frame",Facing:3b,Invisible:1b,Item:{id:"minecraft:apple",count:1}}','item/apple']
];

test('actual WebGL entity draws use native texture batches and repeated UVs', {skip:!jar||!process.env.BROWSER_PLAYWRIGHT,timeout:120000},async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'voxel_entity_render_'));
 let browser,server;
 try{
  const [assets,catalog]=await Promise.all([jarFolder(jar,temp),entityModels(jar)]);
  let doc=await Structure.open(create([11,5,11]));
  doc.edit({tool:'fill',box:[[0,0,0],[10,0,10]],state:{name:'minecraft:grass_block',props:{}}});
  for(const [index,[type,pos,text]] of examples.entries()){
   const id='minecraft:'+type,summoned=Buffer.from([10,0,0,8,0,2,105,100,0,id.length,...Buffer.from(id),0]);
   doc=await Structure.open(doc.layout({kind:'entity',action:'add',id,pos,summoned,palette:0}).raw);
   const edit=doc.layout({kind:'entity',action:'nbt',index,revision:doc.entityDetails(index).revision,text,palette:0});
   if(edit)doc=await Structure.open(edit.raw);
  }
  const signs=[
   ['oak_sign',{rotation:'3',waterlogged:'false'},11],['oak_wall_sign',{facing:'east'},6],
   ['cherry_hanging_sign',{rotation:'7',attached:'true'},8],['cherry_hanging_sign',{rotation:'7',attached:'false'},14],
   ['poplar_wall_hanging_sign',{facing:'west'},20],
  ];
  const signIds=signs.map(([name,props],i)=>{
   const pos=[i+1,1,0];doc.edit({tool:'place',points:[pos],state:{name:'minecraft:'+name,props}});
   return (doc.at(doc.cell(pos))>>1)-1;
  });
  const heads=[{pos:[2,1,1],name:'player_head',props:{rotation:'3'}},{pos:[8,1,9],name:'player_wall_head',props:{facing:'south'}}];
  for(const {pos,name,props} of heads)doc.edit({tool:'fill',box:[pos,pos],commandMode:'replace',state:{name:'minecraft:'+name,props},snbt:'{profile:{texture:"minecraft:entity/player/slim/alex"}}'});
  assert.equal(doc.snapshot().headProfiles.length,2);
  assert.notDeepEqual(catalog.models['minecraft:mannequin'][0].vertices,catalog.models['minecraft:mannequin#slim'][0].vertices);
  assert.equal(Object.keys(catalog.heads).length,20);
  assert.notDeepEqual(catalog.heads['0'][0].vertices,catalog.heads['3'][0].vertices);
  const png=(await readFile(path.join(assets,'minecraft/textures/entity/player/slim/efe.png'))).toString('base64');
  let profileRequests=0;
  server=await serveWebview({assets});
  browser=await launchBrowser();
  const page=await browser.newPage({viewport:{width:1250,height:840}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('receive',async m=>{if(m.type==='ready')await page.evaluate(({catalog,data})=>{
   for(const row of [{type:'prefs',prefs:{resource:{kind:'jar'},materialIntroSeen:true}},{type:'model',data},{type:'entityModels',data:catalog}])window.postMessage(row,'*');
  },{data:doc.snapshot(),catalog});
   if(m.type==='playerSkin'){
    profileRequests++;assert.equal(m.profile.name,'TestPlayer');
    await page.evaluate(({request,png})=>window.postMessage({type:'playerSkin',request,skin:{hash:'fixture',model:'slim',png}},'*'),{request:m.request,png});
   }
  });
  await page.addInitScript(()=>{
   window.acquireVsCodeApi=()=>({postMessage:m=>window.receive(m)});
   const bitmap=createImageBitmap,blob=Response.prototype.blob,images=new WeakMap(),textures=new WeakMap();
   Response.prototype.blob=async function(){const value=await blob.call(this);images.set(value,this.url);return value;};
   window.createImageBitmap=async (value,...args)=>{const result=await bitmap(value,...args);images.set(result,images.get(value)??(value instanceof Blob?'/textures/entity/mock/remote_skin.png':null));return result;};
   const proto=WebGLRenderingContext.prototype,tex=proto.texImage2D,draw=proto.drawArrays;
   proto.texImage2D=function(...args){const url=images.get(args[args.length-1]);if(url)textures.set(this.getParameter(this.TEXTURE_BINDING_2D),url);return tex.apply(this,args);};
   window.entityDraws={};window.skinPasses={};window.headMeshes=[];
   const upload=proto.bufferData,vertices=new WeakMap();
   proto.bufferData=function(target,data,...rest){
    if(target===this.ARRAY_BUFFER&&data instanceof Float32Array)vertices.set(this.getParameter(this.ARRAY_BUFFER_BINDING),data);
    return upload.call(this,target,data,...rest);
   };
   const send=Worker.prototype.postMessage,workers=new WeakSet();
   Worker.prototype.postMessage=function(message,...rest){
    if(message.type==='model'&&!workers.has(this)){
     workers.add(this);this.addEventListener('message',({data})=>{
      if(data.type!=='meshes'||!window.headUvs)return;
      for(const {mesh} of data.output)for(const [id,rect] of window.headUvs){
       const x=id%11,y=Math.floor(id/121),z=Math.floor(id/11)%11;
       for(let i=0;i<mesh.length;i+=8)if(mesh[i]>x&&mesh[i]<x+1&&mesh[i+1]>=y&&mesh[i+1]<y+1&&mesh[i+2]>z&&mesh[i+2]<z+1&&mesh[i+6]>=rect[0]&&mesh[i+6]<rect[2]&&mesh[i+7]>=rect[1]&&mesh[i+7]<rect[3]){if(!window.headMeshes.includes(id))window.headMeshes.push(id);break;}
      }
     });
    }
    if(message.type==='headSkins')window.headUvs=message.heads;
    if(message.type==='styles')window.blockStyles=message.styles;
    return send.call(this,message,...rest);
   };
   proto.drawArrays=function(mode,...args){
    const url=textures.get(this.getParameter(this.TEXTURE_BINDING_2D));
    if(mode===this.TRIANGLES&&url?.includes('/textures/')&&!this.getParameter(this.FRAMEBUFFER_BINDING)){
     const program=this.getParameter(this.CURRENT_PROGRAM),repeat=this.getUniform(program,this.getUniformLocation(program,'entityTexture'));
     const matrix=Array.from(this.getUniform(program,this.getUniformLocation(program,'vp')));
     const key=url.split('/textures/')[1].replace(/^entity\//,'').slice(0,-4),blend=this.isEnabled(this.BLEND);
     const pass=this.getUniform(program,this.getUniformLocation(program,'skinPass'));
     (window.skinPasses[key]??={})[pass]={blend,depthWrite:this.getParameter(this.DEPTH_WRITEMASK)};
     const data=vertices.get(this.getParameter(this.ARRAY_BUFFER_BINDING));
     const span=key==='painting/pointer'&&data?[0,1].map(axis=>{
      const points=data.filter((_,i)=>i%8===axis);return Math.max(...points)-Math.min(...points);
     }):null;
     window.entityDraws[key]={repeat,blend,matrix,span};
    }
    return draw.call(this,mode,...args);
   };
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(names=>names.every(n=>window.entityDraws[n]?.repeat),[...examples.map(e=>e[3]),'painting/back','item/diamond_sword','block/stone']);
  assert.deepEqual(await page.evaluate(()=>window.entityDraws['painting/pointer'].span),[4,4]);
  await page.waitForFunction(()=>window.headMeshes.length===2);assert.equal(profileRequests,1);
  await page.waitForFunction(ids=>ids.every(id=>window.blockStyles?.[id]?.quads.length),signIds);
  const signStyles=await page.evaluate(ids=>ids.map(id=>window.blockStyles[id]),signIds);
  assert.deepEqual(signStyles.map(s=>s.quads.length),signs.map(s=>s[2]),'only the native block model may render each sign');
  assert.ok(signStyles.every(s=>!s.opaque));
  const textures=await page.evaluate(()=>performance.getEntriesByType('resource').map(row=>row.name));
  for(const suffix of ['/block/oak_sign.png','/block/cherry_hanging_sign.png','/block/poplar_hanging_sign.png'])assert.ok(textures.some(url=>url.endsWith(suffix)),suffix);
  assert.ok(!textures.some(url=>url.includes('/textures/entity/signs/')),'modern signs must not request legacy textures');
  assert.deepEqual(errors,[]);
  const passes=await page.evaluate(()=>window.skinPasses);
  for(const key of ['player/wide/ari','mock/remote_skin'])assert.deepEqual(passes[key],{
   1:{blend:false,depthWrite:true},2:{blend:true,depthWrite:false}
  });
  assert.deepEqual(passes['slime/slime'],{0:{blend:true,depthWrite:false}});
  await page.locator('#tab-entities').click();await page.locator('#entityList').selectOption('5');
  assert.match(await page.locator('#entityMotionHint').textContent(),/四个水平方向/);
  await page.locator('#entityList').selectOption('2');assert.match(await page.locator('#entityMotionHint').textContent(),/绿环/);
  const draws=()=>page.evaluate(()=>window.entityDraws),before=await draws();
  const entityList=doc.entityList().map(row=>row.id==='minecraft:cushion'||row.id==='minecraft:oak_boat'?{...row,rotation:[35,0]}:row);
  await page.evaluate(entityList=>window.postMessage({type:'entityRows',data:{entities:entityList.length,entityList}},'*'),entityList);
  await page.waitForFunction(prev=>window.entityDraws['boat/oak'].matrix.some((v,i)=>v!==prev[i]),before['boat/oak'].matrix);
  assert.deepEqual((await draws())['cushion/red_cushion'].matrix,before['cushion/red_cushion'].matrix);
  const cardinal=entityList.map(row=>row.id==='minecraft:cushion'?{...row,rotation:[90,0]}:row);
  await page.evaluate(entityList=>window.postMessage({type:'entityRows',data:{entities:entityList.length,entityList}},'*'),cardinal);
  await page.waitForFunction(prev=>window.entityDraws['cushion/red_cushion'].matrix.some((v,i)=>v!==prev[i]),before['cushion/red_cushion'].matrix);
  if(process.env.VOXEL_ENTITY_SCREENSHOT){
   await page.locator('#scene').hover();await page.mouse.wheel(0,-240);await page.mouse.wheel(0,-100);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:process.env.VOXEL_ENTITY_SCREENSHOT});
  }
 }finally{
  if(browser)await browser.close();if(server)server.close();
  if(path.dirname(temp)===path.resolve(tmpdir())&&path.basename(temp).startsWith('voxel_entity_render_'))await rm(temp,{recursive:true,force:true});
 }
});
