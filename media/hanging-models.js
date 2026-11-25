import {clientBlockModel} from './client-block-model.js';

const tri=[0,1,2,0,2,3];
const yawByFacing=[0,0,0,180,-90,90];
const frameHalf=[.375,.375,1/32];
const mapHalf=[.5,.5,1/32];
const safeId=/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
function resource(value){
 if(typeof value!=='string'||value.length>160||!safeId.test(value)||value.split(/[:/]/).some(p=>!p||p==='.'||p==='..'))return null;
 return value.includes(':')?value:'minecraft:'+value;
}
export function hangingBasis(facing){
 // Model front is local -Z. For floor/ceiling frames vanilla also flips local X.
 if(facing===0)return [[-1,0,0],[0,0,1],[0,1,0]];
 if(facing===1)return [[-1,0,0],[0,0,-1],[0,-1,0]];
 const yaw=(yawByFacing[facing]??0)*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw);
 return [[c,0,s],[0,1,0],[-s,0,c]];
}
export function frameHalfSize(item){return item==='minecraft:filled_map'?mapHalf:frameHalf;}

function paintingModel(texture, w, h){
 const x=w/2,y=h/2,z=1/32,back='minecraft:painting/back';
 const parts=new Map();
 const quad=(id,points,uvs=[[0,0],[1,0],[1,1],[0,1]],shade=1)=>{
  if(!parts.has(id))parts.set(id,{asset:id,vertices:[]});
  const out=parts.get(id).vertices;
  for(const i of tri)out.push(...points[i],shade,shade,shade,...uvs[i].map(v=>Math.min(1-1e-6,v)));
 };
 quad(texture,[[x,y,-z],[-x,y,-z],[-x,-y,-z],[x,-y,-z]]);
 for(let ix=0;ix<w;ix++)for(let iy=0;iy<h;iy++){
  const a=ix-x,b=iy-y;
  quad(back,[[a,b+1,z],[a+1,b+1,z],[a+1,b,z],[a,b,z]],undefined,.83);
  const strip=[[0,0],[1,0],[1,1/16],[0,1/16]];
  if(ix===0)quad(back,[[a,b+1,-z],[a,b,-z],[a,b,z],[a,b+1,z]],strip,.72);
  if(ix===w-1)quad(back,[[a+1,b+1,z],[a+1,b,z],[a+1,b,-z],[a+1,b+1,-z]],strip,.72);
  if(iy===0)quad(back,[[a,b,-z],[a+1,b,-z],[a+1,b,z],[a,b,z]],strip,.65);
  if(iy===h-1)quad(back,[[a,b+1,z],[a+1,b+1,z],[a+1,b+1,-z],[a,b+1,-z]],strip);
 }
 return {parts:[...parts.values()],half:[x,y,z]};
}

// One resolver per webview. Load only the variants and models actually in the structure.
export function createHangingModels(root, dirty){
 const cache=new Map(),modelCache=new Map(),models=new Map();
 async function read(kind, id){
  id=resource(id);if(!id||!root())return null;
  const [ns,path]=id.split(':');
  const res=await fetch(`${root()}/${ns}/${kind}/${path}.json`);
  return res.ok?res.json():null;
 }
 async function blockModel(id,chain=[]){
  id=resource(id);if(!id||chain.includes(id)||chain.length>=24)return null;
  if(models.has(id))return models.get(id);
  if(modelCache.has(id)&&chain.length===0)return modelCache.get(id);
  const pending=(async()=>{
   const raw=await read('models',id);if(!raw)return null;
   const m=clientBlockModel(raw);
   if(raw.parent&&!raw.parent.includes('builtin/'))await blockModel(raw.parent,[...chain,id]);
   if(models.has(id))return models.get(id);
   m.flatten({getBlockModel:key=>models.get(key.toString())});models.set(id,m);return m;
  })();
  if(!chain.length)modelCache.set(id,pending);
  return pending;
 }
 function meshParts(model, isItem){
  const textures=[],lookup=new Map(),parts=new Map();
  // Assign each source texture a disjoint UV interval, then split the baked mesh back into texture batches.
  const mesh=model.getMesh({getTextureUV(key){
   const texture=key.toString();if(!lookup.has(texture)){lookup.set(texture,textures.length);textures.push(texture);}
   const start=lookup.get(texture)*64+8;return [start,0,start+1,1];
  }},{});
  if(isItem)mesh.transform(model.getDisplayTransform('fixed'));
  for(const quad of mesh.quads){
   const vs=quad.vertices(),index=Math.floor(vs[0].texture[0]/64),asset=resource(textures[index]);if(!asset)continue;
   if(!parts.has(asset))parts.set(asset,{asset,vertices:[],item:isItem});
   const out=parts.get(asset).vertices,u0=index*64+8;
   for(const i of tri){
    const {pos,color,texture:[u,v]}=vs[i];
    const scale=isItem?1/32:1/16;
    out.push((pos.x-8)*scale,(pos.y-8)*scale,(pos.z-8)*scale-(isItem?0:15/32),...color,Math.min(1-1e-6,Math.max(0,u-u0)),Math.min(1-1e-6,Math.max(0,v)));
   }
  }
  return [...parts.values()];
 }
 async function itemParts(id){
  const def=await read('items',id);
  // shortcut: use the default branch for dynamic item models; map pixels require the original world save.
  function names(node,depth=0){
   if(!node||depth>8)return [];
   switch(node.type?.replace(/^minecraft:/,'')){
    case 'model':return [node.model];
    case 'composite':return Array.isArray(node.models)?node.models.slice(0,8).flatMap(m=>names(m,depth+1)):[];
    case 'condition':return names(node.on_false,depth+1);
    case 'range_dispatch':case 'select':return names(node.fallback,depth+1);
    default:return [];
   }
  }
  const [ns,path]=id.split(':'),keys=names(def?.model).slice(0,16);
  if(!keys.length)keys.push(`${ns}:item/${path}`);
  const parts=[];
  for(const key of keys){const model=await blockModel(key);if(model)parts.push(...meshParts(model,true));}
  return parts;
 }
 function request(key,load){
  if(!cache.has(key)){
   if(cache.size>=512)return null;
   const row={};cache.set(key,row);
   Promise.resolve().then(load).then(value=>{row.value=value;dirty();}).catch(()=>{dirty();});
  }
  return cache.get(key).value;
 }
 return (row)=>{
  const h=row.hanging;if(!h||!root())return null;
  if(h.art)return request('art:'+h.art,async()=>{
   const variant=await read('painting_variant',h.art);
   const valid=variant&&[variant.width,variant.height].every(n=>Number.isInteger(n)&&n>0&&n<=16);
   const asset=valid?resource(variant.asset_id):'minecraft:kebab';
   const [ns,path]=(asset??'minecraft:kebab').split(':');
   return paintingModel(`${ns}:painting/${path}`,valid?variant.width:1,valid?variant.height:1);
  });
  const name=row.id.slice('minecraft:'.length)+(h.item==='minecraft:filled_map'?'_map':'');
  const frame=row.invisible?[]:request('frame:'+name,async()=>{
   const model=await blockModel('minecraft:block/'+name);return model?meshParts(model,false):[];
  });
  const item=h.item?request('item:'+h.item,()=>itemParts(h.item)):null;
  return {parts:[...(frame??[]),...(item??[])],half:frameHalfSize(h.item)};
 };
}
