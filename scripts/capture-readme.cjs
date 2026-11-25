'use strict';
// Capture the real webview against a disposable structure, never a user save.
const assert = require('node:assert/strict');
const {mkdir, mkdtemp, rm} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {Structure, create, clipThumb, clipEntityPreview, clipHeadProfiles} = require('../lib/nbt');
const {jarFolder, jarMaskData} = require('../lib/assets');
const {entityModels} = require('../lib/mask-java');
const {collisionShapes} = require('../lib/native-summon');
const {serveWebview, launchBrowser} = require('../test/webview-harness.cjs');

async function demo() {
  let doc=await Structure.open(create([20,11,16]));
  const block=(name,a,b=a,props={})=>doc.edit({tool:'fill',box:[a,b],state:{name:'minecraft:'+name,props}});
  block('grass_block',[1,1,1],[18,1,14]);
  block('dirt',[1,0,1],[18,0,14]);
  block('moss_block',[2,1,2],[4,1,7]);
  block('moss_block',[2,1,8],[3,1,11]);
  block('cobblestone',[9,1,10],[11,1,14]);
  block('mossy_cobblestone',[9,1,11],[9,1,12]);
  block('oak_planks',[6,2,4],[13,2,9]);
  block('stripped_spruce_log',[6,3,4],[13,6,4],{axis:'x'});
  block('spruce_planks',[6,3,5],[6,6,9]);
  block('spruce_planks',[13,3,5],[13,6,9]);
  block('spruce_planks',[7,3,9],[12,6,9]);
  for(const [x,z] of [[6,4],[13,4],[6,9],[13,9]])block('stripped_spruce_log',[x,2,z],[x,7,z],{axis:'y'});
  block('air',[9,3,9],[10,5,9]);
  block('glass',[13,4,6],[13,5,7]);
  block('glass',[6,4,6],[6,5,7]);
  block('polished_deepslate',[5,7,3],[14,7,10]);
  block('deepslate_tiles',[6,8,4],[13,8,9]);
  block('deepslate_tiles',[7,9,5],[12,9,8]);
  block('dark_oak_slab',[5,7,10],[14,7,10],{type:'bottom'});
  block('spruce_fence',[7,2,11],[8,2,11],{east:'true',west:'true'});
  block('spruce_fence',[12,2,11],[13,2,11],{east:'true',west:'true'});
  block('lantern',[8,6,10],[8,6,10],{hanging:'true'});
  block('lantern',[11,6,10],[11,6,10],{hanging:'true'});
  block('oak_wall_hanging_sign',[9,6,10],[9,6,10],{facing:'south'});
  block('cherry_log',[3,2,6],[3,6,6],{axis:'y'});
  block('cherry_leaves',[2,5,5],[4,6,7],{persistent:'true'});
  block('cherry_leaves',[1,6,6],[5,6,6],{persistent:'true'});
  block('cherry_leaves',[2,7,5],[4,7,7],{persistent:'true'});
  block('stone_bricks',[14,2,8],[18,2,12]);
  block('water',[15,2,9],[17,2,11],{level:'0'});
  block('lily_pad',[16,3,10]);
  block('chest',[14,2,13],[14,2,13],{facing:'south'});
  const cell=doc.cell([14,2,13]);
  doc.edit({tool:'tile',cell,path:'CustomName',text:'"Workshop supplies"'});
  doc.edit({tool:'tile',cell,path:'Items',text:'[{Slot:0b,id:"minecraft:iron_ingot",count:8},{Slot:1b,id:"minecraft:torch",count:16}]'});
  block('barrel',[15,2,13],[15,2,13],{facing:'up'});
  for(const [p,id] of [[[3,2,10],'allium'],[[4,2,11],'poppy'],[[4,2,12],'azure_bluet'],[[5,2,13],'oxeye_daisy'],[[16,2,6],'dandelion'],[[17,2,7],'short_grass']])block(id,p);
  for(const [id,pos,extra] of [
    ['mannequin',[11.9,2,12.3],'profile:{texture:"minecraft:entity/player/slim/alex",model:"slim"},Rotation:[20f,0f]'],
    ['frog',[16.5,3,12.45],'variant:"minecraft:warm",Rotation:[35f,0f]'],
    ['painting',[7.9,4.5,10.032],'variant:"minecraft:aztec",facing:0b'],
    ['glow_item_frame',[12.5,4.5,10.032],'Facing:3b,Item:{id:"minecraft:diamond_pickaxe",count:1},ItemRotation:1b'],
  ]) {
    const name='minecraft:'+id, bytes=Buffer.from(name), index=doc.entities;
    const summoned=Buffer.concat([Buffer.from([10,0,0,8,0,2,105,100,0,bytes.length]),bytes,Buffer.from([0])]);
    doc=await Structure.open(doc.layout({kind:'entity',action:'add',id:name,pos,summoned,palette:0}).raw);
    doc=await Structure.open(doc.layout({kind:'entity',action:'nbt',index,revision:doc.entityDetails(index).revision,palette:0,text:`{id:"${name}",${extra}}`}).raw);
  }
  return doc;
}

async function capture() {
  const jar=process.env.VOXEL_MASK_JAR;
  assert.ok(jar,'Set VOXEL_MASK_JAR to your local Minecraft 26.3 client JAR');
  const out=path.join(__dirname,'..','docs','screenshots');
  await mkdir(out,{recursive:true});
  const temp=await mkdtemp(path.join(os.tmpdir(),'voxel_readme_'));
  let browser,server;
  try {
    const [assets,models,collision,catalog,doc]=await Promise.all([jarFolder(jar,temp),entityModels(jar),collisionShapes(jar),jarMaskData(jar),demo()]);
    server=await serveWebview({assets});
    browser=await launchBrowser();
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error));
    const post=data=>page.evaluate(data=>window.postMessage(data,'*'),data);
    let clip;
    const snapshot=doc.snapshot();
    await page.exposeFunction('receive',async m=>{
      switch(m.type){
       case 'ready': {
        await post({type:'prefs',prefs:{resource:{kind:'jar',path:'<Minecraft>/versions/26.3/26.3.jar'},keys:{},materialIntroSeen:true,rendering:{mode:'game',gamma:.45}}});
        await post({type:'model',data:snapshot});
        await post({type:'entityModels',data:models});await post({type:'collisionShapes',catalog:collision});
        await post({type:'maskCatalog',catalog:{...catalog,traits:require('../media/mask-states.json')}});break;
       }
       case 'inspect':await post({type:'inspect',cell:m.cell,data:doc.tileInfo(m.cell)});break;
       case 'entityDetails':await post({type:'entityDetails',data:doc.entityDetails(m.index)});break;
       case 'snbt':await post({type:'snbt',...doc.snbt()});break;
       case 'copyTemplate': {
        clip=doc.copySelection(m.selection,0,true,m.region,m.entitySelection??[]);
        await post({type:'templates',items:[{id:1,name:'演示 · 工坊一角',entityCount:clip.entities.length,...clipThumb(clip)}]});
        await post({type:'copied',id:1});break;
       }
       case 'previewTemplate':await post({type:'previewTemplate',id:1,states:clip.states,blocks:clip.blocks.map(b=>[...b.pos,b.id]),entities:clipEntityPreview(clip),headProfiles:clipHeadProfiles(clip)});break;
      }
    });
    await page.addInitScript(()=>{
      window.acquireVsCodeApi=()=>({postMessage:m=>window.receive(m)});
      const gl=WebGLRenderingContext.prototype,uniform=gl.uniformMatrix4fv;
      gl.uniformMatrix4fv=function(loc,trans,mat){
       if(!this.getParameter(this.FRAMEBUFFER_BINDING)&&mat[15]>1&&mat[15]!==1&&!this.getUniform(this.getParameter(this.CURRENT_PROGRAM),this.getUniformLocation(this.getParameter(this.CURRENT_PROGRAM),'entityTexture')))window.demoMatrix=Array.from(mat);
       return uniform.call(this,loc,trans,mat);
      };
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>window.demoMatrix&&!document.querySelector('#save').disabled&&document.querySelector('#stats').textContent.includes('4 实体'));
    const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const click=s=>page.locator(s).click();
    const point=pos=>page.evaluate(p=>{
      const m=window.demoMatrix,r=document.querySelector('#scene').getBoundingClientRect();
      const v=i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12];
      return [r.left+(1+v(0)/v(3))*r.width/2,r.top+(1-v(1)/v(3))*r.height/2];
    },pos);
    const hit=async pos=>page.mouse.click(...await point(pos));
    const capture=async (name,selector)=>{
      await frames();await page.waitForTimeout(180);
      const options={path:path.join(out,name+'.png'),animations:'disabled'};
      if(selector)await page.locator(selector).screenshot(options);else await page.screenshot(options);
      console.log(name+'.png');
    };
    const scene=page.locator('#scene'),rect=await scene.boundingBox();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
    for(let i=0;i<4;i++)await page.mouse.wheel(0,-95);
    await page.mouse.down({button:'middle'});await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2-85,{steps:4});await page.mouse.up({button:'middle'});
    await frames();await page.waitForFunction(()=>document.querySelector('#material').title.startsWith('本地材质'));
    await page.waitForTimeout(550);
    await click('#structureBounds');await capture('overview');await click('#structureBounds');
    await click('[data-tool=box]');await page.locator('#cornerA').fill('13,2,8');await page.locator('#cornerB').fill('18,3,13');await click('#confirmBox');
    await capture('box-tools');
    await click('#maskOpen');await capture('mask','#maskPanel');await click('#maskCancel');
    await scene.focus();await page.keyboard.press('Control+c');await page.locator('[data-template="1"]').waitFor();await click('[data-template="1"]');await hit([4.5,2.01,12.5]);
    await page.waitForFunction(()=>!document.querySelector('#confirmPaste').disabled);
    await page.locator('#message').waitFor({state:'hidden'});
    await capture('blueprint');await page.keyboard.press('Escape');
    await click('[data-tool=pick]');await hit([14.5,2.88,13.5]);
    await page.waitForFunction(()=>document.querySelector('#tileForm')?.textContent.includes('CustomName'));
    await capture('block-nbt');
    await click('#tab-entities');await page.locator('#entityList').selectOption('0');
    await page.waitForFunction(()=>document.querySelector('#entityForm')?.textContent.includes('profile'));
    await capture('entities');
    await page.locator('#structureCommand').fill('/fill ');await click('#commandPick');await page.mouse.move(...await point([15.5,2.88,13.5]));
    await page.keyboard.down('Alt');await capture('commands');await page.keyboard.up('Alt');await page.keyboard.press('Escape');
    await click('#snbtMode');await page.waitForFunction(()=>document.querySelector('#snbtText').value.includes('DataVersion'));
    await capture('snbt','#snbtDialog');await click('#snbtClose');
    await click('#keyboard');await capture('settings','#settingsDialog');
    assert.deepEqual(errors,[]);
  } finally {
    await browser?.close();server?.close();
    const resolved=path.resolve(temp);
    if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('voxel_readme_'))await rm(resolved,{recursive:true,force:true,maxRetries:3});
  }
}

capture().catch(error=>{console.error(error);process.exitCode=1;});
