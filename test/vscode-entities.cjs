const {chromium}=require(process.env.BROWSER_PLAYWRIGHT),assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises'),{join}=require('node:path'),{Structure}=require('../lib/nbt');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:17941');
 try{
  const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(15000);
  if(!await page.locator('iframe.webview').count()){
   if(await page.locator('.tab.active').count())await page.locator('.tab.active .tab-actions .action-label').first().click();
   await page.locator('.explorer-folders-view').getByText('a.nbt',{exact:true}).dblclick();
  }
  const view=page.locator('iframe.webview.ready:visible'),frame=view.contentFrame().locator('iframe#active-frame');
  const step=(fn,...args)=>frame.evaluate((frame,[src,a])=>{const w=frame.contentWindow,q=s=>w.document.querySelector(s);return Function('q','w','args','return ('+src+')(...args)')(q,w,a);},[String(fn),args]);
  const wait=async fn=>{let error;for(let i=0;i<220;i++){try{if(await step(fn))return;}catch(e){error=e;}await new Promise(r=>setTimeout(r,100));}throw new Error(`Timed out: ${fn} ${error??''}`);};
  const click=s=>step(s=>q(s).click(),s);
  const input=(s,v)=>step((s,v)=>{q(s).value=v;q(s).dispatchEvent(new w.Event('input',{bubbles:true}));},s,v);
  await wait(()=>q('#materialIntro')?.open);
  await click('[data-intro-resource=jar]');const chooser=page.locator('.quick-input-widget:visible .quick-input-box input');
  await chooser.fill(process.env.VOXEL_MASK_JAR);await chooser.press('Enter');
  await wait(()=>!!q('#entityIds')?.querySelector('[value="minecraft:pig"]')&&!q('#materialIntro').open);
  await step(()=>{
   const proto=w.WebGLRenderingContext.prototype,upload=proto.texImage2D,draw=proto.drawArrays,seen=new WeakSet();w.entityDraws=0;
   const viewport=proto.viewport,matrix=proto.uniformMatrix4fv;let first=false;
   proto.viewport=function(...a){first=!this.getParameter(this.FRAMEBUFFER_BINDING);return viewport.apply(this,a);};
   proto.uniformMatrix4fv=function(...a){if(first){w.entityProjection=Array.from(a[2]);first=false;}return matrix.apply(this,a);};
   proto.texImage2D=function(...a){const image=a.at(-1);if(image instanceof w.ImageBitmap)seen.add(this.getParameter(this.TEXTURE_BINDING_2D));return upload.apply(this,a);};
   proto.drawArrays=function(...a){if(a[0]===this.TRIANGLES&&seen.has(this.getParameter(this.TEXTURE_BINDING_2D)))w.entityDraws++;return draw.apply(this,a);};
  });
  await click('#tab-entities');await input('#entityId','minecraft:pig');await input('#entityPos','2.5, 1, 2.5');await click('#entityCreate');
  await wait(()=>q('#entitySnbt').value.includes('minecraft:pig')&&w.entityDraws>0);
  const projected=async pos=>{
   const [x,y]=await step(p=>{const m=w.entityProjection,r=q('#scene').getBoundingClientRect(),dot=i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12];
    return [r.x+(1+dot(0)/dot(3))*r.width/2,r.y+(1-dot(1)/dot(3))*r.height/2];},pos);
   const rect=await view.boundingBox();return [rect.x+x,rect.y+y];
  };
  const clearSelection=()=>step(()=>{q('#entityList').value='';q('#entityList').dispatchEvent(new w.Event('change',{bubbles:true}));q('#tab-blocks').click();});
  await clearSelection();await click('#reset');await page.waitForTimeout(150);
  const [px,py]=await projected([2.5,1.55,2.5]);
  await page.mouse.move(px,py);await wait(()=>q('#scene').classList.contains('entity-hover'));
  await page.mouse.down();await page.mouse.move(px+3,py+1);await page.mouse.up();
  await wait(()=>!q('#pane-entities').hidden&&q('#entitySnbt').value.includes('minecraft:pig'));
  await clearSelection();await click('[data-tool=pick]');await page.mouse.click(px,py);
  await wait(()=>!q('#pane-entities').hidden&&q('#entitySnbt').value.includes('minecraft:pig'));

  const before=await step(()=>w.entityDraws);await click('#renderEntities');await step(()=>q('#reset').click());await page.waitForTimeout(120);assert.equal(await step(()=>w.entityDraws),before);await click('#renderEntities');
  await input('#entityPos','3.25, 1, 3.75');await click('#entityMove');await wait(()=>q('#entityList').selectedOptions[0].textContent.includes('3.25, 1, 3.75'));
  assert.match(await step(()=>q('#entitySnbt').value),/"Health":10f/);
  await click('#entityForm > .entity-nbt-add > summary');
  await wait(()=>!!q('#entityForm select[aria-label="可添加字段"] option[value="NoAI"]'));
  await step(()=>{const field=q('#entityForm select[aria-label="可添加字段"]');field.value='NoAI';field.dispatchEvent(new w.Event('change',{bubbles:true}));});
  await step(()=>{const input=q('#entityForm [aria-label="NoAI"]');input.value='1b';input.dispatchEvent(new w.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});
  await click('#entityApply');
  await wait(()=>q('#entitySnbt').value.includes('"NoAI":1b'));
  await click('#entityCopy');await wait(()=>q('[data-template="1"]')?.textContent.includes('实体 · minecraft:pig'));
  await click('#placeTemplateEntities');assert.equal(await step(()=>q('#placeTemplateEntities').checked),false);
  await click('[data-template="1"]');await click('#topView');
  const rect=await view.boundingBox(),canvas=await step(()=>q('#scene').getBoundingClientRect().toJSON());
  await page.mouse.click(rect.x+canvas.x+canvas.width/2+15,rect.y+canvas.y+canvas.height/2+12);
  await wait(()=>!q('#confirmPaste').disabled);await click('#confirmPaste');await wait(()=>q('#stats').textContent.includes('2 实体'));
  await click('#undo');await wait(()=>q('#stats').textContent.includes('1 实体'));await click('#redo');await wait(()=>q('#stats').textContent.includes('2 实体'));
  await click('[data-tool=box]');await input('#cornerA','3,0,3');await input('#cornerB','3,1,3');await click('#confirmBox');await click('#boxIncludeEntities');await click('#copyTemplate');
  await wait(()=>q('[data-template="2"]')?.textContent.includes('实体'));
  await click('#save');const file=join(process.env.VOXEL_SMOKE_ROOT,'a.nbt');
  let saved;for(let i=0;i<50;i++){saved=await Structure.open(await readFile(file));if(saved.entities===2)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(saved.entities,2);assert.match(saved.entityDetails(1).text,/"NoAI":1b/);assert.deepEqual(saved.entityList()[0].pos,[3.25,1,3.75]);
  await click('#tab-entities');await clearSelection();await click('#tab-entities');
  assert.equal(await step(()=>q('#entityDelete').disabled),true);
  await step(()=>{q('#entityList').value='0';q('#entityList').dispatchEvent(new w.Event('change',{bubbles:true}));});
  await wait(()=>q('#entitySnbt').value.includes('minecraft:pig')&&!q('#entityDelete').disabled);
  await input('#entityPos','invalid');await click('#entityDelete');
  const deleteDialog=page.getByRole('dialog').filter({hasText:'删除实体 #1'});
  await deleteDialog.getByRole('button',{name:/cancel|取消/i}).click();
  await wait(()=>!q('#entityDelete').disabled&&q('#stats').textContent.includes('2 实体'));
  await click('#entityDelete');await deleteDialog.getByRole('button',{name:'删除实体',exact:true}).click();
  await wait(()=>q('#stats').textContent.includes('1 实体')&&q('#entityDelete').disabled&&q('#entityEditor').hidden&&!q('#entityList').value);
  assert.equal((await Structure.open(await readFile(file))).entities,2);
  await click('#undo');await wait(()=>q('#stats').textContent.includes('2 实体'));
  await click('#redo');await wait(()=>q('#stats').textContent.includes('1 实体'));
  await click('#save');for(let i=0;i<50;i++){saved=await Structure.open(await readFile(file));if(saved.entities===1)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(saved.entities,1);assert.match(saved.entityDetails(0).text,/"NoAI":1b/);
  console.log('ENTITY_UI_OK: add, pick, move, edit, copy/paste, cancel and confirm delete, undo/redo and save');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
