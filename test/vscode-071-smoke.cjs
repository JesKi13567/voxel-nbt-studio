const {chromium}=require(process.env.BROWSER_PLAYWRIGHT),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:17939');try{
 const p=browser.contexts()[0].pages()[0];
 const step=(fn,...data)=>p.frames()[1].evaluate(([src,args])=>{const w=document.querySelector('iframe#active-frame').contentWindow,d=w.document,q=k=>d.querySelector(k);return Function('w','d','q','a','return ('+src+')(...a)')(w,d,q,args);},[String(fn),data]);
 const wait=async fn=>{let last;for(let i=0;i<55;i++){try{if(await step(fn))return;}catch(e){last=e;}await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out '+fn+' '+(last||''));};
 await wait(()=>q('#stats')?.textContent.includes('可见'));
 await step(()=>{const proto=w.WebGLRenderingContext.prototype,fn=proto.uniformMatrix4fv;proto.uniformMatrix4fv=function(...args){if(!this.getParameter(this.FRAMEBUFFER_BINDING))w.flightMatrix=Array.from(args[2]);return fn.apply(this,args);};q('#scene').focus();});
 await p.keyboard.press('f');await wait(()=>!q('#flightHelp').hidden&&q('#coords').textContent.includes('18.0 格/秒')&&w.flightMatrix);
 const locked=await step(()=>d.pointerLockElement===q('#scene'));
 if(locked){const before=await step(()=>w.flightMatrix);await step(()=>q('#scene').dispatchEvent(new w.MouseEvent('mousemove',{movementX:55,movementY:-40,bubbles:true})));await new Promise(r=>setTimeout(r,100));assert.notDeepEqual(await step(()=>w.flightMatrix),before);}
 else{
  const outer=await p.locator('iframe.webview').boundingBox(),inner=await step(()=>q('#scene').getBoundingClientRect().toJSON());
  const x=outer.x+inner.x+inner.width*.5,y=outer.y+inner.y+inner.height*.5;
  await p.mouse.move(x,y);await new Promise(r=>setTimeout(r,100));const before=await step(()=>w.flightMatrix);
  await p.mouse.move(x+62,y-39,{steps:7});await new Promise(r=>setTimeout(r,120));assert.notDeepEqual(await step(()=>w.flightMatrix),before);
 }
 await step(()=>q('#scene').dispatchEvent(new w.WheelEvent('wheel',{deltaY:-1000,cancelable:true})));
 await wait(()=>q('#coords').textContent.includes('24.0 格/秒'));await step(()=>q('#scene').dispatchEvent(new w.WheelEvent('wheel',{deltaY:2000,cancelable:true})));
 await wait(()=>q('#coords').textContent.includes('8.0 格/秒'));
 await p.keyboard.press('Escape');await wait(()=>!d.pointerLockElement&&q('#flightHelp').hidden);
 console.log('VSCODE_FLIGHT_POINTER_OK: real Webview mouse movement (lock or in-canvas), 16→24→8, Esc');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
