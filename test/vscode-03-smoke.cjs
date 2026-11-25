const {chromium}=require(process.env.BROWSER_PLAYWRIGHT);const assert=require('node:assert/strict');const {Structure}=require('../lib/nbt');const {readFile}=require('node:fs/promises');const path=require('node:path');
(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:17931');try {
 const p=b.contexts()[0].pages()[0], f=p.frames()[1];
 const step=(fn,...a)=>f.evaluate(([str,data])=>{const w=document.querySelector('iframe#active-frame').contentWindow,d=w.document;const q=s=>d.querySelector(s);const set=(s,v)=>{const el=q(s);el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));};return Function('w','d','q','set','a','return ('+str+')(...a)')(w,d,q,set,data);},[String(fn),a]);
 const wait=async(fn,...a)=>{for(let i=0;i<70;i++){if(await step(fn,...a))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out testing '+fn+' '+JSON.stringify(await step(()=>[q('#mode')?.textContent,q('#dimensions')?.textContent,q('#message')?.textContent,q('#selectionTitle')?.textContent])));};
 await wait(()=>q('#stats')?.textContent.startsWith('2 可见')&&q('#material')?.title.includes('2/2'));
 await step(()=>q('#scene').focus());await p.keyboard.press('b');await wait(()=>q('#mode').textContent==='框选区域');
 await step(()=>{set('#cornerA','3,0,3');set('#cornerB','4,0,3');q('#confirmBox').click();});await wait(()=>q('#mode').textContent==='框选区域'&&q('#selectionTitle').textContent==='已选 2 格');
 await step(()=>q('#steps button[data-axis="1"][data-step="1"]').click());await wait(()=>q('#message').textContent.includes('允许移动'));
 await step(()=>{q('#moveTile').click();q('#steps button[data-axis="1"][data-step="1"]').click();});await wait(()=>!q('#save').disabled&&!q('#message').textContent);await step(()=>q('#save').click());
 const file=path.join(process.env.VOXEL_SMOKE_ROOT,'editable.nbt');
 async function disk(fn){for(let i=0;i<45;i++){const doc=await Structure.open(await readFile(file));if(fn(doc))return doc;await new Promise(r=>setTimeout(r,130));}throw Error('Save did not match: '+fn);}
 const moved=await disk(doc=>doc.tileInfo(doc.cell([3,1,3]))?.data.Items?.[0].count===3);
 assert.equal(moved.tileInfo(moved.cell([3,0,3])),null);assert.equal(moved.state((moved.at(moved.cell([4,1,3]))>>1)-1).name,'minecraft:stone');
 await step(()=>q('#paletteAdd').click());await wait(()=>q('#palette').options.length===2&&q('#palette').value==='1');
 await step(()=>{const b=Array.from(q('#swatches').children).find(v=>v.title==='minecraft:stone');b.click();set('#name','minecraft:gold_block');q('#paletteState').click();});await wait(()=>Array.from(q('#swatches').children).some(b=>b.title==='minecraft:gold_block'));
 await step(()=>q('#resize').click());await wait(()=>q('#sizeDialog').open);
 await step(()=>{set('#sizeX','10');q('#sizeForm').requestSubmit();});await wait(()=>q('#dimensions').textContent==='10 × 8 × 8');
 await step(()=>q('#undo').click());await wait(()=>q('#dimensions').textContent==='8 × 8 × 8');
 await step(()=>q('#redo').click());await wait(()=>q('#dimensions').textContent==='10 × 8 × 8');
 await step(()=>q('#save').click());const final=await disk(d=>d.size[0]===10&&d.palettes.length===2);assert.equal(final.state(1,0).name,'minecraft:stone');assert.equal(final.state(1,1).name,'minecraft:gold_block');assert.equal(final.tileValue(final.cell([3,1,3]),'LootTableSeed').text,'333L');
 await step(()=>q('#paletteDelete').click());await wait(()=>q('#palette').options.length===1);await step(()=>q('#undo').click());await wait(()=>q('#palette').options.length===2);
 console.log('VSCODE_03_OK keyboard B, box multi-selection, protection, tile move and persistence, palette add/edit/delete/undo, resizing/undo/redo');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
