const {chromium}=require(process.env.BROWSER_PLAYWRIGHT);const assert=require('node:assert/strict');const {Structure}=require('../lib/nbt');const {readFile}=require('node:fs/promises');const path=require('node:path');
(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:17931');try{
 const p=b.contexts()[0].pages()[0];
 const step=(fn,...args)=>p.frames()[1].evaluate(([src,args])=>{const w=document.querySelector('iframe#active-frame').contentWindow,d=w.document;const q=k=>d.querySelector(k);const set=(s,v)=>{const el=q(s);el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));};return Function('w','d','q','set','a','return ('+src+')(...a)')(w,d,q,set,args);},[String(fn),args]);
 const wait=async fn=>{let last;for(let i=0;i<70;i++){try{if(await step(fn))return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,120));}throw new Error('Timed out '+fn+' '+(last||''));};
 await wait(()=>q('#stats')?.textContent.startsWith('2 可见'));
 await step(()=>{q('#keyboard').click();q('#keysList button').click();});await p.keyboard.press('k');await wait(()=>q('#keysList button')?.textContent==='k');
 await step(()=>{q('#settingsClose').click();q('[data-tool=box]').click();q('#scene').focus();});await p.keyboard.press('k');await wait(()=>q('#mode').textContent==='查看');
 await step(()=>{q('[data-tool=box]').click();set('#cornerA','0,0,0');set('#cornerB','0,0,0');set('#name','minecraft:amethyst_block');set('#props','');q('#apply').click();});await wait(()=>q('#stats').textContent.startsWith('3 可见'));
 await step(()=>{q('#keyboard').click();q('[data-resource=none]').click();});
 await wait(()=>q('#material')?.disabled&&q('#stats')?.textContent.startsWith('3 可见')&&!q('#settingsDialog').open);
 await step(()=>{q('#keyboard').click();});await wait(()=>q('#keysList button')?.textContent==='k'&&q('#resourcePath')?.textContent.includes('色块模式'));
 await step(()=>q('[data-resource=auto]').click());await wait(()=>!q('#material')?.disabled&&q('#stats')?.textContent.startsWith('3 可见')&&!q('#settingsDialog').open);
 await step(()=>q('#save').click());const file=path.join(process.env.VOXEL_SMOKE_ROOT,'editable.nbt');
 let ok=false;for(let i=0;i<40;i++){const doc=await Structure.open(await readFile(file));if(doc.snapshot().visible===3){assert.equal(doc.state((doc.at(0)>>1)-1).name,'minecraft:amethyst_block');ok=true;break;}await new Promise(r=>setTimeout(r,150));}assert.ok(ok);
 console.log('VSCODE_04_OK shortcut persisted across resource reload, unsaved edit preserved and saved');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
