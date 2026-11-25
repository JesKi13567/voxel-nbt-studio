const resourcePath=raw=>{
 if(typeof raw!=='string'||raw.length>=240||!/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(raw)||raw.split(/[:/]/).some(p=>!p||p==='.'||p==='..'))return null;
 const [ns,path]=raw.includes(':')?raw.split(':'):['minecraft',raw];
 return `${ns}/${path.startsWith('textures/')?'':'textures/'}${path}${path.endsWith('.png')?'':'.png'}`;
};
const modelOf=path=>path?.includes('/slim/')?'slim':'wide';
export const avatar=id=>id==='minecraft:mannequin'||id==='minecraft:player';
export function playerSkins(vscode,onChange){
 const profiles=new Map(),pending=new Map();let serial=0;
 function pump(){
  for(const row of profiles.values()){
   if(pending.size>=4)break;
   if(row.asked)continue;row.asked=true;const request=++serial;pending.set(request,row);vscode.postMessage({type:'playerSkin',request,profile:row.profile});
  }
 }
 function appearance(profile,defaults){
  const p=profile??{},uuid=p.uuid,hash=uuid&&/^[a-f0-9]{32}$/.test(uuid)?[0,8,16,24].reduce((a,i)=>a^parseInt(uuid.slice(i,i+8),16),0):null;
  const fallback=resourcePath(defaults?.[hash!==null?((hash%defaults.length)+defaults.length)%defaults.length:6]??'entity/player/slim/steve');
  const local=resourcePath(p.resource);
  const key=p.hash?'h:'+p.hash:p.uuid?'u:'+p.uuid:p.name?'n:'+p.name.toLowerCase():null;
  if(key&&!profiles.has(key)&&profiles.size<128&&!local){profiles.set(key,{profile:p});pump();}
  const skin=profiles.get(key)?.skin;
  return {path:local??fallback,png:local?null:skin?.png,key:local?local:skin?.hash??fallback,model:p.model??(local?modelOf(local):skin?.model??modelOf(fallback)),fallback};
 }
 function receive(request,skin){const row=pending.get(request);if(!row)return;pending.delete(request);row.skin=skin?.png?skin:null;pump();onChange();}
 return {appearance,receive};
}
export async function skinImage(root,{path,png,fallback}){
 async function load(){
  if(png)return new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'});
  const r=await fetch(`${root}/${path}`);if(!r.ok)throw new Error('Missing skin');return r.blob();
 }
 async function decode(blob){
  const img=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  if(img.width===64&&img.height===64)return img;
  if(img.width!==64||img.height!==32){img.close();throw new Error('Invalid skin dimensions');}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  for(const [u,v] of [[0,48],[40,48]]){
   const x=u===0?0:40,y=16;
   for(const [sx,sy,dx,dy,w,h] of [[4,0,4,0,4,4],[8,0,8,0,4,4],[8,4,0,4,4,12],[4,4,4,4,4,12],[0,4,8,4,4,12],[12,4,12,4,4,12]]){
    const tx=(u===0?16:32)+dx;ctx.save();ctx.translate(tx+w,v+dy);ctx.scale(-1,1);ctx.drawImage(img,x+sx,y+sy,w,h,0,0,w,h);ctx.restore();
   }
  }
  img.close();return createImageBitmap(canvas);
 }
 try{return await decode(await load());}catch(e){
  if(!fallback||!png&&path===fallback)throw e;
  const r=await fetch(`${root}/${fallback}`);if(!r.ok)throw e;return decode(await r.blob());
 }
}
