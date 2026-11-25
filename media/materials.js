import {Identifier,BlockState,BlockDefinition,SpecialRenderer} from './model-engine.js';
import {clientBlockModel} from './client-block-model.js';
import {skinImage} from './player-skins.js';
const blocked=new Set(['minecraft:air','minecraft:cave_air','minecraft:void_air','minecraft:structure_void']);
const empty={up:false,down:false,west:false,east:false,north:false,south:false};
const dirs=['east','west','up','down','south','north'];
const shade=[.81,.67,1,.50,.9,.74];
const legal=s=>/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(s)&&!s.split(/[:/]/).some(p=>p==='..'||p==='.'||!p);
const id=s=>s.includes(':')?s:'minecraft:'+s;
const chestTexture={chest:'normal',trapped_chest:'trapped',ender_chest:'ender',copper_chest:'copper',exposed_copper_chest:'copper_exposed',weathered_copper_chest:'copper_weathered',oxidized_copper_chest:'copper_oxidized'};
let containerModels;
async function containerStyle(block,props,atlasUV){
 if(block.namespace!=='minecraft')return null;
 const name=block.path.replace(/^waxed_/,''),chest=Object.hasOwn(chestTexture,name),shulker=block.path==='shulker_box'||/^[a-z_]+_shulker_box$/.test(block.path);
 if(!chest&&!shulker)return null;
 containerModels??=fetch(new URL('./container-models.json',import.meta.url)).then(r=>r.ok?r.json():null).catch(()=>null);
 const models=await containerModels;if(!models)return null;
 const half=chest&&name!=='ender_chest'&&['left','right'].includes(props.type)?props.type:'single',facing=props.facing;
 const directions=chest?models.chest[half]:models.shulker;
 const mesh=directions[Object.hasOwn(directions,facing)?facing:chest?'north':'up'];
 const texture=chest?'chest/'+chestTexture[name]+(half==='single'?'':'_'+half):'shulker/shulker'+(block.path==='shulker_box'?'':'_'+block.path.slice(0,-12));
 const [u0,v0,u1,v1]=atlasUV('minecraft:entity/'+texture);
 // Preserve the entity model's UV orientation and closed geometry; it is not a block model or a full cube.
 return {quads:mesh.map(([nx,ny,nz,...data])=>{
  const normal=[nx,ny,nz],axis=normal.findIndex(n=>Math.abs(n)>.99),face=axis<0?-1:axis*2+Number(normal[axis]<0),k=shade[face]??.9,v=[];
  for(let i=0;i<data.length;i+=5)v.push(data[i],data[i+1],data[i+2],k,k,k,u0+(u1-u0)*data[i+3],v0+(v1-v0)*data[i+4]);
  return {side:-1,full:false,face,v,bakedShade:k};
 }),opaque:false,alpha:false,self:null};
}
// Keep the UV slots stable as the user picks new blocks. Upload only the occupied tiles.
export class Materials{
 constructor(gl,root,onChange){
  this.gl=gl;this.root=root?.replace(/\/$/,'');this.notify=onChange;
  this.heads=null;this.skinSlots=new Map();this.json=new Map();this.models=new Map();this.defs=new Map();this.styles=new Map();this.slots=new Map();this.jobs=[];this.inflight=0;this.pending=new Set();
  this.side=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));this.tile=32;this.across=this.side/this.tile;this.nextTile=1;this.nextContainer=0;
  this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.side,this.side,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=this.tile;
  this.ctx=this.canvas.getContext('2d');this.ctx.imageSmoothingEnabled=false;
  this.ctx.fillStyle='#47364d';this.ctx.fillRect(0,0,this.tile,this.tile); this.ctx.fillStyle='#745981';this.ctx.fillRect(0,0,16,16);this.ctx.fillRect(16,16,16,16);this.upload(0,0);
  this.access={getBlockModel:k=>this.models.get(k.toString())??null,getTextureUV:k=>this.uv(k.toString()),getPixelSize:()=>1/this.side,getBlockFlags:()=>null};
 }
 url(k,dir,ext){if(!this.root||!legal(k))return null;const [ns,path]=k.split(':');return `${this.root}/${ns}/${dir}/${path}.${ext}`;}
 read(k,dir){const url=this.url(k,dir,'json');if(!url)return Promise.resolve(null);
  if(!this.json.has(url))this.json.set(url,fetch(url).then(r=>r.ok?r.json():null).catch(()=>null));return this.json.get(url);
 }
 async model(k,chain=[]){if(chain.includes(k)||chain.length>=32)return null;
  const cached=this.models.get(k);if(cached)return cached;const d=await this.read(k,'models'); if(!d)return null;
  if(typeof d.parent==='string'&&!d.parent.includes('builtin/'))await this.model(id(d.parent),[...chain,k]);
  if(this.models.has(k))return this.models.get(k);
  const model=clientBlockModel(d);model.flatten(this.access);this.models.set(k,model);return model;
 }
 upload(x,y){const {gl}=this;gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,this.canvas);}
 slotUv(x,y,t=this.tile){const s=this.side;return [x/s,y/s,(x+t)/s,(y+t)/s];}
 uv(k){
  if(this.slots.has(k))return this.slots.get(k);
  const url=this.url(k,'textures','png');if(!url)return this.slotUv(0,0);
  const pixels=/^minecraft:entity\/(?:chest|shulker|player)\//.test(k)?64:this.tile;
  const slot=this.reserveTile(pixels);if(!slot)return this.slotUv(0,0);
  const [x,y]=slot,rect=this.slotUv(x,y,pixels);this.slots.set(k,rect);
  const ready=new Promise(ok=>this.jobs.push({k,url,x,y,pixels,ok}));this.pending.add(ready);ready.then(()=>this.pending.delete(ready));this.pump();return rect;
 }
 reserveTile(pixels){
  const container=pixels===64,columns=this.side/pixels,i=container?this.nextContainer:this.nextTile;
  const x=(i%columns)*pixels,y=container?this.side-(Math.floor(i/columns)+1)*pixels:Math.floor(i/columns)*pixels;
  // Pack the native 64 px container sheets from the other end of the shared atlas.
  if(container?y<Math.ceil(this.nextTile/this.across)*this.tile:y+pixels>this.side-Math.ceil(this.nextContainer/(this.side/64))*64)return null;
  if(container)this.nextContainer++;else this.nextTile++;
  return [x,y];
 }
 setHeads(heads){this.heads=heads;for(const key of this.styles.keys())if(/^minecraft:player_(?:wall_)?head\0/.test(key))this.styles.delete(key);}
 skinUv(skin){
  if(!this.skinSlots.has(skin.key))this.skinSlots.set(skin.key,skinImage(this.root,skin).then(img=>{
   const slot=this.reserveTile(64);if(!slot){img.close();return null;}
   this.paintTile(...slot,64,ctx=>ctx.drawImage(img,0,0));img.close();return this.slotUv(...slot,64);
  }).catch(()=>null));
  return this.skinSlots.get(skin.key);
 }
 headStyle(st){
  const key=st.name==='minecraft:player_wall_head'?st.props?.facing??'north':st.props?.rotation??'0',parts=this.heads?.[key];
  if(!parts?.length)return null;
  const uv=this.uv('minecraft:entity/'+parts[0].texture),quads=[];
  for(const {vertices} of parts)for(let q=0;q<vertices.length;q+=48){
   const v=[];for(const offset of [0,8,16,40]){
    const i=q+offset;v.push(...vertices.slice(i,i+6),uv[0]+vertices[i+6]*(uv[2]-uv[0]),uv[1]+vertices[i+7]*(uv[3]-uv[1]));
   }quads.push({side:-1,full:false,face:-1,v,bakedShade:.9});
  }
  return {quads,opaque:false,alpha:false,self:null,headUV:uv};
 }
 paintTile(x,y,pixels,draw){
  if(this.canvas.width!==pixels)this.canvas.width=this.canvas.height=pixels;
  this.ctx.imageSmoothingEnabled=false;this.ctx.clearRect(0,0,pixels,pixels);draw(this.ctx);
  this.upload(x,y);this.notify();
 }
 pump(){while(this.inflight<12&&this.jobs.length){this.inflight++;const {k,url,x,y,pixels,ok}=this.jobs.shift();
  fetch(url).then(r=>{if(!r.ok)throw new Error();return r.blob();}).then(b=>createImageBitmap(b)).then(img=>{
   const animated=k.includes(':block/')&&img.height>img.width&&img.height%img.width===0;
   this.paintTile(x,y,pixels,ctx=>ctx.drawImage(img,0,0,img.width,animated?img.width:img.height,0,0,pixels,pixels));img.close();
  }).catch(()=>this.paintTile(x,y,pixels,ctx=>{const half=pixels/2;ctx.fillStyle='#745981';ctx.fillRect(0,0,pixels,pixels);ctx.fillStyle='#47364d';ctx.fillRect(0,0,half,half);ctx.fillRect(half,half,half,half);})).finally(()=>{this.inflight--;ok();this.pump();});
 }}
 fluidUV(){return Object.fromEntries(['water','lava'].map(k=>[k,[this.uv('minecraft:block/'+k+'_still'),this.uv('minecraft:block/'+k+'_flow')]]));}
 async idle(){await Promise.all(this.pending);}
 async state(st){const key=st.name+'\0'+JSON.stringify(Object.entries(st.props||{}).sort());if(!this.root||blocked.has(st.name))return null;
  if(!this.styles.has(key))this.styles.set(key,this.bake(st).catch(()=>null));return this.styles.get(key);
 }
 async bake(st){
  const name=st.name,block=Identifier.parse(name);if(['minecraft:water','minecraft:lava','minecraft:bubble_column'].includes(name))return null;
  if(name==='minecraft:player_head'||name==='minecraft:player_wall_head'){const head=this.headStyle(st);if(head)return head;}
  const container=await containerStyle(block,st.props??{},k=>this.uv(k));if(container)return container;
  let d;
  if(this.defs.has(name))d=await this.defs.get(name);else{const pending=this.read(name,'blockstates');this.defs.set(name,pending);d=await pending;}
  let def=d?BlockDefinition.fromJson(d):null;
  const defProps=Object.fromEntries((Object.keys(d?.variants||{})[0]||'').split(',').filter(k=>k.includes('=')).map(k=>k.split('=')));
  const props={...defProps,...st.props};let variants=def?.getModelVariants(props)||[];
  if(!variants.length){const m=block.namespace+':block/'+block.path;if(await this.model(m)){def=BlockDefinition.fromJson({variants:{'':{model:m}}});variants=def.getModelVariants(props);}}
  await Promise.all(variants.map(v=>this.model(id(v.model))));
  const normal=def&&variants.every(v=>this.models.has(id(v.model)))?def.getMesh(block,props,this.access,this.access,empty).quads:[];
  // Newer JARs supply sign geometry and block textures; older ones use the special renderer.
  const hasSignModel=normal.length>0&&block.path.endsWith('_sign');
  const quads=hasSignModel?normal:normal.concat(SpecialRenderer.getBlockMesh(new BlockState(name,{...props,waterlogged:'false'}),undefined,this.access,empty).quads);
  if(!quads.length)return null;
  const p=block.path,trans=/glass|(?:^|_)ice$|^water$|portal|honey_block|slime_block/.test(p),thin=/leaves|spawner|fence|bars/.test(p);
  const data=quads.map(q=>{
   const vv=q.vertices(),n=q.normal(),ns=[n.x,n.y,n.z];let side=-1;
   for(let j=0;j<6;j++){const axis=j>>1;const edge=j%2?0:1;if(Math.abs(ns[axis])>.99&&vv.every(v=>Math.abs([v.pos.x,v.pos.y,v.pos.z][axis]-edge)<.0001)){side=j;break;}}
   const axis=ns.findIndex(v=>Math.abs(v)>.99),face=axis<0?-1:axis*2+Number(ns[axis]<0);
   const k=side<0?.9:shade[side];const full=side>=0&&[0,1,2].filter(axis=>axis!==(side>>1)).every(axis=>{const pp=vv.map(v=>[v.pos.x,v.pos.y,v.pos.z][axis]);return Math.min(...pp)<.0001&&Math.max(...pp)>.9999;});
   const v=vv.flatMap(v=>[v.pos.x,v.pos.y,v.pos.z,v.color[0]*k,v.color[1]*k,v.color[2]*k,...v.texture]);return {side,full,v,face};
  });
  return {quads:data,opaque:!trans&&!thin&&dirs.every((_,i)=>data.some(q=>q.side===i&&q.full)),alpha:trans,self:trans?name:null};
 }
}
