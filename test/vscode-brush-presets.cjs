const {chromium}=require(process.env.BROWSER_PLAYWRIGHT);
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {join}=require('node:path');
const {Structure}=require('../lib/nbt');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:17941');
 try{
  const page=browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(10000);
  const webview=page.locator('iframe.webview.ready:visible');
  const pane=webview.contentFrame().locator('iframe#active-frame');
  const ui=(selector,action,value)=>pane.evaluate((frame,{selector,action,value})=>{
   const {contentDocument:d,contentWindow:w}=frame,el=d.querySelector(selector);
   if(!el)return undefined;
   if(action==='click')return el.click();
   if(action==='presets')return [...el.querySelectorAll('.brush-preset-row')].map(row=>[
    row.querySelector('.brush-preset-choice').textContent,row.querySelector('.brush-preset-remove')?.textContent??null
   ]);
   if(action==='open')return el.matches(':popover-open');
   if(action==='point'){
    const target=value?[...el.querySelectorAll('button')].find(b=>b.textContent===value||b.getAttribute('aria-label')===value):el;
    if(!target)return;
    const r=target.getBoundingClientRect(),f=frame.getBoundingClientRect();
    return [f.x+r.x+r.width/2,f.y+r.y+r.height/2];
   }
   if(action==='input'){el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
   return el.value??el.textContent;
  },{selector,action,value});
  const until=async(label,check)=>{
   const end=Date.now()+10000;
   do{if(await check())return;await new Promise(r=>setTimeout(r,100));}while(Date.now()<end);
   throw new Error('Timed out waiting for '+label);
  };
  const field=(id,action,value)=>ui('#'+id,action,value);
  const presets=()=>field('brushPresetMenu','presets');
  const menuOpen=()=>field('brushPresetMenu','open');
  const waitPreset=label=>until(label,async()=> (await presets())?.some(([name])=>name===label));
  const mouseClick=async(id,label)=>{
   const {x,y}=await webview.boundingBox(),point=await field(id,'point',label);
   assert.ok(point,`Missing ${label||id}`);
   await page.mouse.click(x+point[0],y+point[1]);
  };
  const expand=async()=>{await mouseClick('brushPreset');await until('open preset menu',menuOpen);};
  const pick=async label=>{
   await expand();await mouseClick('brushPresetMenu',label);
   assert.equal(await menuOpen(),false);
  };
  const quickInput=page.locator('.quick-input-widget .quick-input-box input');
  const open=async name=>{
   const tab=page.locator('.tab').filter({hasText:name});
   if(await tab.count())await tab.click();
   else await page.locator('.explorer-folders-view').getByText(name,{exact:true}).dblclick();
   await page.locator('.tab.active').filter({hasText:name}).waitFor();
  };
  const reload=async()=>{
   await page.keyboard.press('Control+Shift+p');await quickInput.fill('>Developer: Reload Window');
   await page.getByText('Developer: Reload Window',{exact:true}).first().waitFor();
   await Promise.all([page.waitForEvent('domcontentloaded'),quickInput.press('Enter')]);
  };
  await open('a.nbt');
  await waitPreset('草方块');
  const file=join(process.env.VOXEL_SMOKE_ROOT,'a.nbt'),initial=await readFile(file);
  const before=await field('stats');
  const builtins=[['空气','air'],['石头','stone'],['草方块','grass_block']];
  assert.deepEqual(await presets(),builtins.map(([label])=>[label,null]));
  await expand();await page.keyboard.press('Escape');assert.equal(await menuOpen(),false);
  for(const [label,id] of builtins){
   await pick(label);assert.equal(await field('name'),`minecraft:${id}`);
  }
  await field('name','input','minecraft:oak_log');await field('props','input','axis=x');
  await field('saveBrushPreset','click');
  const savedLabel='横放橡木 '+Date.now();
  await quickInput.fill(savedLabel);await quickInput.press('Enter');
  await waitPreset(savedLabel);
  await pick('空气');assert.equal(await field('props'),'');
  await pick(savedLabel);assert.equal(await field('props'),'axis=x');
  assert.equal(await field('stats'),before);assert.deepEqual(await readFile(file),initial);
  await reload();
  await waitPreset(savedLabel);
  await open('b.nbt');
  await waitPreset(savedLabel);
  await pick(savedLabel);assert.equal(await field('name'),'minecraft:oak_log');assert.equal(await field('props'),'axis=x');
  await ui('[data-tool=box]','click');await field('cornerA','input','0,0,0');await field('cornerB','input','0,0,0');await field('apply','click');
  await until('one visible block',async()=> (await field('stats')).startsWith('1 可见方块'));
  await field('save','click');
  const second=join(process.env.VOXEL_SMOKE_ROOT,'b.nbt');
  await until('saved file',async()=>{
   const doc=await Structure.open(await readFile(second));const state=doc.state((doc.at(0)>>1)-1);
   if(!state)return false;
   assert.deepEqual(state,{name:'minecraft:oak_log',props:{axis:'x'}});return true;
  });
  const savedB=await readFile(second);
  await field('saveBrushPreset','click');
  const otherLabel='保留测试项 '+Date.now();
  await quickInput.fill(otherLabel);await quickInput.press('Enter');await waitPreset(otherLabel);
  await pick('石头');await expand();
  assert.deepEqual(await presets(),[...builtins.map(([label])=>[label,null]),[savedLabel,'-'],[otherLabel,'-']]);
  await mouseClick('brushPresetMenu',`删除预设「${savedLabel}」`);
  const remaining=[...builtins.map(([label])=>[label,null]),[otherLabel,'-']];
  await until('instant deletion',async()=> (await presets()).length===remaining.length);
  assert.deepEqual(await presets(),remaining);
  assert.equal(await menuOpen(),true);
  assert.equal(await field('name'),'minecraft:stone');
  assert.deepEqual(await readFile(second),savedB);
  await page.keyboard.press('Escape');assert.equal(await menuOpen(),false);
  await open('a.nbt');assert.deepEqual(await presets(),remaining);
  assert.deepEqual(await readFile(file),initial);
  await reload();await waitPreset(otherLabel);
  assert.deepEqual(await presets(),remaining);
  console.log('BRUSH_PRESETS_OK: mouse dropdown, Escape, edit, inline deletion, persistence and untouched files');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
