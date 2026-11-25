'use strict';
const {createHash}=require('node:crypto');
const {Reader,flag,listHeader,fail,numbers,numericList,editCompound}=require('./nbt-codec');
const {profileView}=require('./player-skins');

// Structure entity records: local position, preserved payload and render metadata.
function entityId(nbt){
  const f=new Reader(nbt).fields().get('id');if(f?.type!==8)fail('实体 NBT 必须有字符串 id');
  const name=new Reader(nbt,f.at).str(),id=name.includes(':')?name:`minecraft:${name}`;
  if(id.length>160||!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id))fail('实体 ID 无效');return id;
}
// These native renderers ignore Entity Rotation; a cushion only uses Direction.fromYRot.
const fixedEntityRotation=new Set(['minecraft:area_effect_cloud','minecraft:dragon_fireball','minecraft:end_crystal','minecraft:experience_orb','minecraft:falling_block','minecraft:interaction','minecraft:lightning_bolt','minecraft:marker','minecraft:tnt']);
function entityRotationMode(id){return id==='minecraft:cushion'?'cardinal':fixedEntityRotation.has(id)?'fixed':'free';}
const playerHeads=new Set(['minecraft:player_head','minecraft:player_wall_head']);
function nbtProfile(nbt,fields){
  const f=fields.get('profile')??fields.get('SkullOwner');
  if(!f||f.end-f.at>16*1024||![8,10].includes(f.type))return undefined;
  try{
    // Display() skips typed arrays; the profile UUID is an NBT int array.
    if(f.type===8)return profileView(new Reader(nbt,f.at).str())??undefined;
    const fields=new Reader(nbt,f.at).fields(),view=new Reader(nbt,f.at).display(10);
    const id=fields.get('id')??fields.get('Id');
    if(id?.type===11){const r=new Reader(nbt,id.at);if(r.len()===4)view.id=[r.int(),r.int(),r.int(),r.int()];}
    return profileView(view)??undefined;
  }catch{return undefined;}
}
const frameIds=new Set(['minecraft:item_frame','minecraft:glow_item_frame']);
const paintingFacing=[3,4,2,5]; // South, west, north, east (painting's legacy 2D encoding).
const facingNames=['down','up','north','south','west','east'];
const facingVectors=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
const integerTag=(bytes,field)=>field?.type===1?bytes.readInt8(field.at):field?.type===3?bytes.readInt32BE(field.at):undefined;
const stringTag=(bytes,field)=>field?.type===8?new Reader(bytes,field.at).str():undefined;
const resourceId=value=>value&&value.length<=160&&/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(value)&&!value.split(/[:/]/).some(p=>!p||p==='.'||p==='..')?(value.includes(':')?value:'minecraft:'+value):undefined;
function hangingView(nbt,fields,id,rotation){
  const painting=id==='minecraft:painting';
  if(!painting&&!frameIds.has(id))return undefined;
  const field=fields.get(painting?'facing':'Facing')??fields.get(painting?'Facing':'facing');
  const code=integerTag(nbt,field),fallback=paintingFacing[Math.round(rotation[0]/90)&3];
  const facing=facingNames.indexOf(stringTag(nbt,field));
  const direction=facing>=0&&(!painting||facing>=2)?facing:painting?paintingFacing[code]:facingVectors[code]?code:undefined;
  if(painting)return {facing:direction??fallback,art:resourceId(stringTag(nbt,fields.get('variant'))??stringTag(nbt,fields.get('Motive'))?.toLowerCase())??'minecraft:kebab'};
  const item=fields.get('Item');let itemId;
  if(item?.type===10)itemId=resourceId(stringTag(nbt,new Reader(nbt,item.at).fields().get('id')));
  return {facing:direction??(rotation[1]>=45?0:rotation[1]<=-45?1:fallback),item:itemId==='minecraft:air'?undefined:itemId,spin:(integerTag(nbt,fields.get('ItemRotation'))??0)&7};
}
function entityView(raw){
  const f=new Reader(raw).fields(),t=f.get('nbt');if(t?.type!==10)return null;
  const pos=numbers(raw,f.get('pos'),6,3)??numbers(raw,f.get('pos'),3,3);if(!pos?.every(Number.isFinite))return null;
  const nbt=raw.subarray(t.at,t.end),fields=new Reader(nbt).fields();let id;
  try{id=entityId(nbt);}catch{return null;}
  const age=fields.get('Age'),baby=fields.get('IsBaby'),invis=fields.get('Invisible'),variant=fields.get(id==='minecraft:cushion'?'color':'variant');
  const rawRotation=numbers(nbt,fields.get('Rotation'),5,2),rotation=rawRotation?.every(Number.isFinite)?rawRotation:[0,0];
  const hanging=hangingView(nbt,fields,id,rotation);
  return {raw,pos,blockPos:numbers(raw,f.get('blockPos'),3,3)??pos.map(Math.floor),nbt,id,rotation,hanging,rotationMode:hanging?'hanging':entityRotationMode(id),
    profile:id==='minecraft:mannequin'||id==='minecraft:player'?nbtProfile(nbt,fields):undefined,
    baby:Boolean(age?.type===3&&nbt.readInt32BE(age.at)<0||baby?.type===1&&nbt[baby.at]),
    invisible:Boolean(invis?.type===1&&nbt[invis.at]),variant:variant?.type===8?new Reader(nbt,variant.at).str():null,revision:createHash('sha256').update(raw).digest('hex')};
}
function stripEntityIdentity(nbt,depth=0){
  if(depth>16)fail('实体乘客嵌套过深');
  const f=new Reader(nbt).fields(),list=f.get('Passengers');let out=editCompound(nbt,['UUID'],null);
  for(const k of ['UUIDMost','UUIDLeast'])if(f.has(k))out=editCompound(out,[k],null);
  if(list?.type===9){
    const r=new Reader(nbt,list.at),kind=r.byte(),n=r.len();if(kind===10){
      if(n>512)fail('实体乘客过多');const parts=[listHeader(10,n)];
      for(let i=0;i<n;i++){const at=r.p;r.skipTag(10);parts.push(stripEntityIdentity(nbt.subarray(at,r.p),depth+1));}
      out=editCompound(out,['Passengers'],{type:9,data:Buffer.concat(parts)});
    }
  }
  return out;
}
function packEntity(row,pos,nbt,rotation,axes,explicitBlockPos){
  const delta=pos.map((v,i)=>Math.floor(v)-Math.floor(row?.pos[i]??v));
  const blockPos=explicitBlockPos??(row?row.blockPos.map((n,i)=>n+delta[i]):pos.map(Math.floor));
  const nf=new Reader(nbt).fields();if(nf.has('Pos'))nbt=editCompound(nbt,['Pos'],numericList(pos,6));
  if(rotation)nbt=editCompound(nbt,['Rotation'],numericList(rotation,5));
  if(axes&&(row?.hanging||nf.get('Facing')?.type===1)){
    const painting=row?.id==='minecraft:painting',key=painting?(nf.has('facing')||!nf.has('Facing')?'facing':'Facing'):'Facing';
    const v=facingVectors[row?.hanging?.facing??integerTag(nbt,nf.get(key))];
    const d=v&&applyAxes(v,axes),world=d?facingVectors.findIndex(p=>p.every((n,j)=>n===d[j])):-1;
    const i=painting?paintingFacing.indexOf(world):world;
    if(i>=0)nbt=editCompound(nbt,[key],{type:1,data:flag(i)});
  }
  let raw=row?.raw??flag(0);
  raw=editCompound(raw,['pos'],numericList(pos,6));raw=editCompound(raw,['blockPos'],numericList(blockPos,3));
  return editCompound(raw,['nbt'],{type:10,data:nbt});
}
function applyAxes(v,axes){return [0,1,2].map(i=>axes.reduce((sum,a,j)=>sum+a[i]*v[j],0));}
function entityTransform(raw,origin,axes){
  const row=entityView(raw);if(!row)fail('无法读取模板中的实体');
  const pos=applyAxes(row.pos.map(n=>n-.5),axes).map((n,i)=>n+origin[i]+.5);
  const yaw=row.rotation[0]+Math.atan2(-axes[2][0],axes[2][2])*180/Math.PI;
  const rotation=row.rotationMode==='fixed'?null:[((yaw+180)%360+360)%360-180,row.rotation[1]];
  return {pos,raw:packEntity(row,pos,stripEntityIdentity(row.nbt),rotation,axes,applyAxes(row.blockPos,axes).map((n,i)=>n+origin[i]))};
}

module.exports={entityId,entityView,stripEntityIdentity,packEntity,entityTransform,playerHeads,nbtProfile};
