'use strict';
const namePattern=/^[A-Za-z0-9_]{1,16}$/,uuidPattern=/^[a-f0-9]{32}$/,hashPattern=/^[a-f0-9]{32,64}$/;
function textureProperty(value){
 if(typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return null;
 try{
  const skin=JSON.parse(Buffer.from(value,'base64').toString('utf8')).textures?.SKIN;
  const hash=/^https?:\/\/textures\.minecraft\.net\/texture\/([a-f0-9]{32,64})$/.exec(skin?.url)?.[1];
  return hash?{hash,model:skin.metadata?.model==='slim'?'slim':'wide'}:null;
 }catch{return null;}
}
function profileView(value){
 if(typeof value==='string')value={name:value};
 if(!value||typeof value!=='object')return null;
 const rawName=value.name??value.Name,name=typeof rawName==='string'&&namePattern.test(rawName)?rawName:null,id=value.id??value.Id;
 const uuid=Array.isArray(id)&&id.length===4&&id.every(n=>Number.isInteger(n)&&n===(n|0))?id.map(n=>(n>>>0).toString(16).padStart(8,'0')).join(''):typeof id==='string'?id.toLowerCase().replace(/-/g,''):null;
 const props=value.properties??value.Properties;
 const property=Array.isArray(props)?props.find(p=>p?.name==='textures')?.value:props?.textures?.[0]?.Value;
 const skin=textureProperty(property),texture=value.texture,model=value.model;
 const resource=typeof texture==='string'&&texture.length<240&&/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(texture)&&!texture.split(/[:/]/).some(p=>!p||p==='.'||p==='..')?texture:null;
 if(!skin&&!resource&&!uuidPattern.test(uuid??'')&&!name&&!['wide','slim'].includes(model))return null;
 return {...(skin??{}),...(['wide','slim'].includes(model)?{model}:{}),...(resource?{resource}:{}),...(uuidPattern.test(uuid??'')?{uuid}:{}),...(name?{name}:{})};
}
async function body(url,limit){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(7000), credentials:'omit'});
 if(!response.ok||!response.body||Number(response.headers.get('content-length'))>limit){await response.body?.cancel();return null;}
 const parts=[];let bytes=0;
 for await(const part of response.body){bytes+=part.length;if(bytes>limit)return null;parts.push(part);}
 return Buffer.concat(parts,bytes);
}
async function json(url){const bytes=await body(url,64*1024);return bytes&&JSON.parse(bytes.toString('utf8'));}
const cache=new Map();let active=0;
function playerSkin({hash,uuid,name}={}){
 const key=typeof hash==='string'&&hashPattern.test(hash)?'h:'+hash:typeof uuid==='string'&&uuidPattern.test(uuid)?'u:'+uuid:typeof name==='string'&&namePattern.test(name)?'n:'+name.toLowerCase():null;
 if(!key)return Promise.resolve(null);
 if(cache.has(key))return cache.get(key);
 if(active>=8)return Promise.resolve(null);
 if(cache.size>=256)cache.delete(cache.keys().next().value);
 active++;
 const result=(async()=>{
  let skin;
  if(key.startsWith('h:'))skin={hash};
  else {
   const id=key.startsWith('u:')?uuid:(await json('https://api.mojang.com/users/profiles/minecraft/'+name))?.id;
   if(typeof id!=='string'||!uuidPattern.test(id))return null;
   const data=await json('https://sessionserver.mojang.com/session/minecraft/profile/'+id);
   skin=textureProperty(data?.properties?.find(p=>p?.name==='textures')?.value);
  }
  if(!skin)return null;
  const png=await body('https://textures.minecraft.net/texture/'+skin.hash,256*1024);
  if(!png||png.length<33||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)!==64||![32,64].includes(png.readUInt32BE(20)))return null;
  return {hash:skin.hash,model:skin.model,png:png.toString('base64')};
 })().catch(()=>null).finally(()=>{active--;});
 cache.set(key,result);return result;
}
module.exports={profileView,playerSkin};
