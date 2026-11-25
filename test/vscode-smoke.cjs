const {chromium}=require(process.env.BROWSER_PLAYWRIGHT);
const {readFile}=require('node:fs/promises');const {join}=require('node:path');const assert=require('node:assert/strict');const {Structure}=require('../lib/nbt');
(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:17931');try{
 const page=b.contexts()[0].pages()[0];const frame=page.frames()[1];
 async function doOn(action, value){return frame.evaluate(([action,value])=>{const w=document.querySelector('iframe#active-frame').contentWindow;const d=w.document;const q=s=>d.querySelector(s);
 if(action==='read')return [q('#stats')?.textContent,q('#message')?.textContent,q('#material')?.title];
 if(action==='fill'){
  q('[data-tool=box]').click();for(const [sel,v] of [['#cornerA','2,1,2'],['#cornerB','4,1,3'],['#name','minecraft:amethyst_block']]){const e=q(sel);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));}q('#apply').click();
 }else{q(value).click();}
 },[action,value]);}
 const expectN=async n=>{for(let i=0;i<55;i++){let [count,err]=await doOn('read');if(count?.includes(n+' 可见方块'))return;if(i===54)throw new Error('expected '+n+' got '+count+' :: '+err);await new Promise(r=>setTimeout(r,150));}};
 await expectN(244);for(let i=0;i<60;i++){const [,,title]=await doOn('read');if(title?.includes('2/2'))break;if(i===59)throw new Error('Material assets not active: '+title);await new Promise(r=>setTimeout(r,150));}await doOn('fill');await expectN(250);
 await doOn('click','#undo');await expectN(244);
 await doOn('click','#redo');await expectN(250);
 await doOn('click','#save');const filename=join(process.env.VOXEL_SMOKE_ROOT,'editable.nbt');
 for(let i=0;i<40;i++){const doc=await Structure.open(await readFile(filename));if(doc.snapshot().visible===250){assert.equal(doc.state((doc.at(doc.cell([2,1,2]))>>1)-1).name,'minecraft:amethyst_block');console.log('VSCODE_TEXTURED_CUSTOM_EDITOR_OK 244 -> 250 -> undo 244 -> redo 250 -> saved 250');return;}await new Promise(r=>setTimeout(r,150));}
 throw new Error('The file was not saved');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
