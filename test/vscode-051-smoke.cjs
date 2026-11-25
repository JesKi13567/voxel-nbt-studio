const {chromium}=require(process.env.BROWSER_PLAYWRIGHT);
const assert=require('node:assert/strict');
const {Structure}=require('../lib/nbt');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:17931');try{
 const p=browser.contexts()[0].pages()[0];
 const step=(fn,...args)=>p.frames()[1].evaluate(([src,args])=>{const w=document.querySelector('iframe#active-frame').contentWindow,d=w.document;const q=k=>d.querySelector(k);return Function('w','d','q','a','return ('+src+')(...a)')(w,d,q,args);},[String(fn),args]);
 const wait=async fn=>{let last;for(let i=0;i<65;i++){try{if(await step(fn))return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,130));}throw new Error('Timed out '+fn+' '+(last||''));};
 await wait(()=>q('#stats')?.textContent.startsWith('6 可见')&&q('#material').title.includes('1/1'));
 await step(()=>{q('#topView').click();q('[data-tool=erase]').click();});
 // Offset the nested webview's local CSS coordinates by its iframe rectangle in the workbench.
 const outer=await p.locator('iframe.webview').boundingBox();
 const canvas=await step(()=>{const r=q('#scene').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
 function xy(x){const pitch=1.565,dist=Math.hypot(10,7,10)*1.07,sy=Math.sin(pitch),cz=Math.cos(pitch),v=[x-5,1-(7*.48+dist*sy),4.5-(5+dist*cz)];const k=canvas.h*.5/(Math.tan(95*Math.PI/360)*-(v[1]*sy+v[2]*cz));return [outer.x+canvas.x+canvas.w*.5+v[0]*k,outer.y+canvas.y+canvas.h*.5-(v[1]*cz-v[2]*sy)*k];}
 await p.mouse.move(...xy(2.5));await p.mouse.down();
 await wait(()=>q('#save').disabled);await p.mouse.move(...xy(7.5),{steps:6});await p.mouse.up();
 await wait(()=>q('#stats').textContent.startsWith('0 可见')&&!q('#save').disabled);await step(()=>q('#save').click());
 const file=path.join(process.env.VOXEL_SMOKE_ROOT,'editable.nbt');
 async function checkDisk(n){for(let i=0;i<40;i++){if((await Structure.open(await readFile(file))).snapshot().visible===n)return;await new Promise(r=>setTimeout(r,100));}throw new Error('Expected saved block count '+n);}
 await checkDisk(0);await step(()=>q('#undo').click());await wait(()=>q('#stats').textContent.startsWith('6 可见'));
 await step(()=>q('#save').click());await checkDisk(6);
 await step(()=>q('#redo').click());await wait(()=>q('#stats').textContent.startsWith('0 可见'));
 console.log('VSCODE_051_OK: physical drag erased 6 blocks, saved, one undo restored all, redo erased all');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
