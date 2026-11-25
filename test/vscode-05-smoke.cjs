const {chromium}=require(process.env.BROWSER_PLAYWRIGHT);const assert=require('node:assert/strict');const {Structure}=require('../lib/nbt');const {readFile}=require('node:fs/promises');const path=require('node:path');
(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:17931');try{
 const page=browser.contexts()[0].pages()[0];const step=(fn,...data)=>page.frames()[1].evaluate(([src,args])=>{const w=document.querySelector('iframe#active-frame').contentWindow,d=w.document;const q=k=>d.querySelector(k);const set=(s,v,event='input')=>{const el=q(s);el.value=v;el.dispatchEvent(new w.Event(event,{bubbles:true}));};return Function('w','d','q','set','a','return ('+src+')(...a)')(w,d,q,set,args);},[String(fn),data]);
 const wait=async fn=>{let last;for(let i=0;i<65;i++){try{if(await step(fn))return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,130));}throw new Error('Timed out '+fn+' '+(last||''));};
 await wait(()=>q('#swatches button[title^="minecraft:oak_stairs["] canvas')&&q('#material').title.includes('2/2'));
 await step(()=>{if(!q('#settingsDialog').open)q('#keyboard').click();set('#navigationPreset','blender','change');});await wait(()=>q('#navigationHint').textContent.startsWith('中键旋转'));
 await step(()=>q('[data-resource=none]').click());await wait(()=>!q('#settingsDialog').open&&q('#material').disabled&&q('#swatches button canvas'));
 await step(()=>q('#keyboard').click());await wait(()=>q('#navigationPreset').value==='blender');await step(()=>q('#settingsClose').click());
 await step(()=>{q('[data-tool=box]').click();set('#cornerA','1,1,1');set('#cornerB','1,1,1');const event=new w.WheelEvent('wheel',{deltaY:-120,altKey:true,cancelable:true});q('#scene').dispatchEvent(event);});
 await wait(()=>q('#boxHint').textContent.includes('Y 1–2')&&q('#layer').value==='0');
 await step(()=>{q('#scene').dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,altKey:true,cancelable:true}));q('#confirmBox').click();});
 await wait(()=>q('#selectionTitle').textContent==='已选 1 格'&&q('#selectionRange').textContent.includes('Y 1–1'));
 await step(()=>{q('#moveOverwrite').click();set('#allowBlock','stone');q('#allowAdd').click();q('#steps button[data-axis="1"][data-step="1"]').click();});
 await wait(()=>q('#stats').textContent.startsWith('1 可见')&&q('#selectionRange').textContent.includes('Y 2–2'));await step(()=>q('#save').click());
 const file=path.join(process.env.VOXEL_SMOKE_ROOT,'editable.nbt');let saved=false;
 for(let i=0;i<50;i++){const doc=await Structure.open(await readFile(file));if(doc.snapshot().visible===1){assert.equal(doc.state((doc.at(doc.cell([1,2,1]))>>1)-1).name,'minecraft:oak_stairs');saved=true;break;}await new Promise(r=>setTimeout(r,90));}assert.ok(saved);
 await step(()=>q('#undo').click());await wait(()=>q('#stats').textContent.startsWith('2 可见'));
 console.log('VSCODE_05_OK real model thumbnails, saved nav preset, selection height without work-layer change, overwrite save and undo');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
