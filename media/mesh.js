'use strict';
// Classic worker intentionally bundles its small mesher: VS Code webviews load workers via a blob URL.
const AIR=new Set(['minecraft:air','minecraft:cave_air','minecraft:void_air','minecraft:structure_void']);
const N=16,TRANSFORM_AIR=(32768+1)*2;
const preview=new Map();let headSkins=new Map(),headSources=new Map();let brushId=-1,brushColor,brushStyle,brushState,brushLiquid;
const faces=[
 [1,0,0, .81, [[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[-1,0,0,.67,[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]],
 [0,1,0,1,[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]],[0,-1,0,.50,[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
 [0,0,1,.90,[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]],[0,0,-1,.74,[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]
];
const gameFaces=[.6,.6,1,.5,.8,.8],cornerOcclusion=[1,.86,.70,.54];
const tri=[0,1,2,0,2,3];let gameLighting=false;let grid,size,colors,present,styles=[],liquid=[],fluidUV={},mode='full',layer=0,epoch=0,queue=new Set(),scheduled=false,model=0;
// Unwritten cells and legacy explicit structure_void use the same red marker.
const missingStyle=[.0625,1,.25,.25],airStyle=[.125,.62,.52,1],markerLimit=32768;
const invisibleStyle=name=>name==='minecraft:structure_void'?missingStyle:AIR.has(name)?airStyle:undefined;
let invisible=[],showInvisible=false,markerTimer=false,markerBase=null;
function sampleMarkers(start,end){
 let missing=0,saved=0;
 for(let i=start;i<end;i++){const v=grid[i];if(!v)missing++;else if(invisible[(v>>1)-1])saved++;}
 // Sample actual marker positions, not a coordinate grid that can miss a thin expansion.
 const emptyCount=Math.min(missing,Math.max(markerLimit-saved,markerLimit/4));
 const savedCount=Math.min(saved,markerLimit-emptyCount),cells=new Uint32Array(emptyCount+savedCount);
 const rank=(index,total,count)=>Math.floor((index+.5)*total/count);
 let s=0,e=0,seenSaved=0,seenEmpty=0;
 for(let i=start;i<end;i++){
  const value=grid[i],style=value&&invisible[(value>>1)-1];
  if(style&&s<savedCount&&seenSaved++===rank(s,saved,savedCount))cells[s++]=i;
  if(!value&&e<emptyCount&&seenEmpty++===rank(e,missing,emptyCount))cells[savedCount+e++]=i;
 }
 return {cells,sampled:emptyCount<missing||savedCount<saved};
}
function markerStyle(value){const id=(value>>1)-1;return value===TRANSFORM_AIR?airStyle:!value?missingStyle:id===brushId?invisibleStyle(brushState?.name):invisible[id];}
function invisibleMesh(){
 const [w,h,d]=size,start=w*d*(mode==='single'?layer:0),end=w*d*(mode==='full'?h:layer+1);
 const base=markerBase??=sampleMarkers(start,end),live=[];
 // Preview cells take priority over sampled markers without resampling the whole volume on each stroke.
 for(const [i,v] of preview)if(i>=start&&i<end&&markerStyle(v))live.push(i);
 const data=new Float32Array(Math.min(markerLimit,base.cells.length+live.length)*192);let n=0,sampled=base.sampled;
 const push=(i,value)=>{
  const [x,y,z]=xyz(i),[r,red,green,blue]=markerStyle(value);
  const vertex=bits=>{data[n++]=x+.5+(bits&1?r:-r);data[n++]=y+.5+(bits&2?r:-r);data[n++]=z+.5+(bits&4?r:-r);data[n++]=red;data[n++]=green;data[n++]=blue;data[n++]=-1;data[n++]=-1;};
  for(const axis of [1,2,4])for(let bits=0;bits<8;bits++)if(!(bits&axis)){vertex(bits);vertex(bits|axis);}
 };
 for(const i of live){if(n===data.length){sampled=true;break;}push(i,preview.get(i));}
 for(const i of base.cells){if(preview.has(i))continue;if(n===data.length){sampled=true;break;}push(i,grid[i]);}
 return {vertices:data.subarray(0,n),sampled};
}
function scheduleInvisible(rebuild=false){
 if(rebuild)markerBase=null;
 if(!showInvisible||markerTimer)return;markerTimer=true;
 setTimeout(()=>{markerTimer=false;if(!showInvisible||!grid)return;
  const {vertices,sampled}=invisibleMesh();postMessage({type:'invisibleMesh',model,mode,layer,vertices,sampled},[vertices.buffer]);
 },0);
}
function dataOf(base64){const s=atob(base64),bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return new Uint32Array(bytes.buffer);}
const heights=[14.2,12.5,10.5,9,7,5.3,3.7,1.9,16,16,16,16,16,16,16,16];
function liquidState(s){const pure=['minecraft:water','minecraft:lava','minecraft:bubble_column'].includes(s.name),kind=s.name==='minecraft:lava'?'lava':pure||s.props?.waterlogged==='true'||/^minecraft:(?:kelp|kelp_plant|seagrass|tall_seagrass)$/.test(s.name)?'water':null;
 return kind?{kind,pure,height:(heights[+s.props?.level]??heights[0])/16}:null;
}
function describe(states,swatches){colors=swatches;present=states.map(s=>!AIR.has(s.name));liquid=states.map(liquidState);invisible=states.map(s=>invisibleStyle(s.name));}
function fluidMesh(x,y,z,neighbours,f,solid,out,liquidAt,fluidUV,game){
 const h=liquidAt(neighbours[2])?.kind===f.kind?1:f.height;
 const base=fluidUV[f.kind]?f.kind==='water'?[.31,.55,.95]:[1,1,1]:f.kind==='water'?[.22,.42,.84]:[.95,.38,.09];
 for(let side=0;side<6;side++){
  const n=neighbours[side];if(solid(n)||liquidAt(n)?.kind===f.kind)continue;
  const [,,,smooth,points]=faces[side],shade=game?gameFaces[side]:smooth,vertical=(side>>1)!==1,uv=fluidUV[f.kind]?.[vertical?1:0];
  for(const i of tri){const p=points[i],a=(side>>1)===0?p[2]:p[0],b=vertical?(1-p[1]*h):p[2],s=uv?uv[0]+(uv[2]-uv[0])*(.002+.996*a):f.kind==='water'?-2:-1,t=uv?uv[1]+(uv[3]-uv[1])*(.002+.996*b):-1;
   out.push(x+p[0],y+p[1]*h,z+p[2],base[0]*shade,base[1]*shade,base[2]*shade,s,t);}
 }
}

function xyz(c){const [w,,d]=size,q=Math.floor(c/w);return [c%w,Math.floor(q/d),q%d];}
function at(x,y,z){const [w,h,d]=size;if(x<0||y<0||z<0||x>=w||y>=h||z>=d||(mode==='single'&&y!==layer)||(mode==='below'&&y>layer))return -1;const i=x+w*(z+d*y),s=((preview.size?(preview.get(i)??grid[i]):grid[i])>>1)-1;return (s===brushId?brushState&&!AIR.has(brushState.name):present[s])?s:-1;}
function mark(x,y,z){const [w,h,d]=size;if(x<0||y<0||z<0||x>=w||y>=h||z>=d)return;queue.add(`${x>>4},${y>>4},${z>>4}`);}
function dirtyCell(c){
 const [x,y,z]=xyz(c);if(gameLighting){
  const [w,h,d]=size;
  for(let a=Math.max(0,x-1)>>4;a<=Math.min(w-1,x+1)>>4;a++)for(let b=Math.max(0,y-1)>>4;b<=Math.min(h-1,y+1)>>4;b++)for(let k=Math.max(0,z-1)>>4;k<=Math.min(d-1,z+1)>>4;k++)queue.add(`${a},${b},${k}`);
 }else{mark(x,y,z);for(const [a,b,d] of faces)mark(x+a,y+b,z+d);}
}
function styleOf(id){return id===brushId?brushStyle:styles[id];}
function liquidOf(id){return id===brushId?brushLiquid:liquid[id];}
const cellKey=(x,y,z)=>x+size[0]*(z+size[2]*y);
const world={get:at,styleAt:styleOf,headAt:(x,y,z)=>{const k=cellKey(x,y,z);return headSkins.get(preview.has(k)?headSources.get(k):k);},liquidAt:liquidOf,swatch:id=>id===brushId?brushColor:colors[id],get uv(){return fluidUV;},get game(){return gameLighting;}};
function every(){const [w,h,d]=size;for(let y=0;y<h;y+=N)for(let z=0;z<d;z+=N)for(let x=0;x<w;x+=N)mark(x,y,z);}
function rebuild(key){const [x0,y0,z0]=key.split(',').map(x=>Number(x)*N),[w,h,d]=size, vertices=[],alpha=[];
 if((mode==='below'&&y0>layer)||(mode==='single'&&(y0>layer||y0+N<=layer)))return [new Float32Array(0),new Float32Array(0)];
 for(let y=Math.max(y0,mode==='single'?layer:y0);y<Math.min(y0+N,h,mode==='full'?h:layer+1);y++)for(let z=z0;z<Math.min(z0+N,d);z++)for(let x=x0;x<Math.min(x0+N,w);x++){
   const id=at(x,y,z);if(id<0)continue;
   emitBlock(x,y,z,id,world,vertices,alpha);
 }
 return [Float32Array.from(vertices),Float32Array.from(alpha)];
}
function ambientCorner(x,y,z,side,px,py,pz,get,solid){
 const axis=side>>1,u=(axis+1)%3,v=(axis+2)%3,point=[px,py,pz],base=[x,y,z];base[axis]+=side%2?-1:1;
 const a=point[u]<.5?-1:1,b=point[v]<.5?-1:1;
 base[u]+=a;const edgeA=Number(solid(get(...base)));base[v]+=b;const diagonal=Number(solid(get(...base)));
 base[u]-=a;const edgeB=Number(solid(get(...base)));return cornerOcclusion[edgeA&&edgeB?3:edgeA+edgeB+diagonal];
}
function emitBlock(x,y,z,id,{get,styleAt,headAt,liquidAt,swatch,uv,game},vertices,alpha){
 const style=styleAt(id),neighbours=faces.map(([dx,dy,dz])=>get(x+dx,y+dy,z+dz));
 const solid=n=>n>=0&&!liquidAt(n)?.pure&&(styleAt(n)?.opaque??!styleAt(n));
 const f=liquidAt(id);if(f){fluidMesh(x,y,z,neighbours,f,solid,f.kind==='lava'?vertices:alpha,liquidAt,uv,game);if(f.pure)return;}
 if(style){
  const to=style.alpha?alpha:vertices,skin=style.headUV&&headAt?.(x,y,z),du=skin?skin[0]-style.headUV[0]:0,dv=skin?skin[1]-style.headUV[1]:0;
  for(const {side,full,v,face,bakedShade} of style.quads){
   if(side>=0&&(solid(neighbours[side])||(full&&style.self&&styleAt(neighbours[side])?.self===style.self)))continue;
   if(game){
    const strength=(gameFaces[side<0?face:side]??.9)/(bakedShade??(side<0?.9:faces[side][3]));
    const light=[0,8,16,24].map(k=>strength*(side<0?1:ambientCorner(x,y,z,side,v[k],v[k+1],v[k+2],get,solid)));
    for(const i of tri){const k=i*8,l=light[i];to.push(x+v[k],y+v[k+1],z+v[k+2],v[k+3]*l,v[k+4]*l,v[k+5]*l,v[k+6]+du,v[k+7]+dv);}
   }else for(const i of tri){const k=i*8;to.push(x+v[k],y+v[k+1],z+v[k+2],v[k+3],v[k+4],v[k+5],v[k+6]+du,v[k+7]+dv);}
  }
 }else{
  const color=swatch(id)||[.73,.65,.77];
  for(let s=0;s<6;s++){
   const [,,,shade,vs]=faces[s];if(solid(neighbours[s]))continue;
   const light=game?vs.map(p=>gameFaces[s]*ambientCorner(x,y,z,s,...p,get,solid)):null;
   for(const i of tri){const v=vs[i],k=light?.[i]??shade;vertices.push(x+v[0],y+v[1],z+v[2],color[0]*k,color[1]*k,color[2]*k,-1,-1);}
  }
 }
}
function blueprintVertices(m){
 const [w,h,d]=m.size,key=(x,y,z)=>x+w*(z+d*y),markers=m.states.map(s=>invisibleStyle(s.name));
 const blocks=new Map(m.blocks.filter(b=>b[3]>=0&&!markers[b[3]]).map(([x,y,z,id])=>[key(x,y,z),id]));
 const liquids=m.states.map(liquidState),skins=new Map(m.headSkins),verts=[],context={get:(x,y,z)=>x<0||y<0||z<0||x>=w||y>=h||z>=d?-1:blocks.get(key(x,y,z))??-1,
  styleAt:id=>m.styles[id],headAt:(x,y,z)=>skins.get(key(x,y,z)),liquidAt:id=>liquids[id],swatch:id=>m.colors[id],uv:m.fluidUV,game:m.game};
 for(const [x,y,z,id] of m.blocks){
  const marker=id<0?missingStyle:markers[id];
  if(marker){
   const from=verts.length;
   emitBlock(x,y,z,id,{...context,get:()=>-1,styleAt:()=>null,swatch:()=>marker.slice(1)},verts,verts);
   for(let i=from;i<verts.length;i+=8)for(const [a,p] of [x,y,z].entries())verts[i+a]=p+.5+(verts[i+a]-p-.5)*marker[0]*2;
  }else emitBlock(x,y,z,id,context,verts,verts);
  // shortcut: unusually complex templates use a color mesh instead of retaining huge textured buffers.
  if(m.styles.length&&verts.length>12_000_000)return blueprintVertices({...m,styles:[],fluidUV:{}});
 }
 return Float32Array.from(verts);
}
function pump(){scheduled=false;const start=performance.now(),output=[];let count=0;
 for(const key of queue){queue.delete(key);const [mesh,alpha]=rebuild(key);output.push({key,mesh,alpha});if(++count>=16||performance.now()-start>15)break;}
 if(output.length)postMessage({type:'meshes',model,epoch,output,remaining:queue.size}, output.flatMap(o=>[o.mesh.buffer,o.alpha.buffer]));
 if(queue.size&&!scheduled){scheduled=true;setTimeout(pump,0);}
}
function schedule(){if(!scheduled&&queue.size){scheduled=true;setTimeout(pump,0);}}
onmessage=({data:m})=>{
 if(m.type==='blueprintMesh'||m.type==='templateThumb'){const vertices=blueprintVertices(m);postMessage({type:m.type,model:m.model,run:m.run,id:m.id,vertices},[vertices.buffer]);}
 else if(m.type==='model'){
  size=m.size;model=m.model;epoch=m.epoch;mode=m.mode;layer=m.layer;gameLighting=Boolean(m.game);showInvisible=Boolean(m.showInvisible);
  describe(m.states,m.colors);styles=[];fluidUV={};preview.clear();headSkins.clear();headSources.clear();brushId=-1;brushState=brushStyle=brushLiquid=null;grid=new Uint32Array(size[0]*size[1]*size[2]);
  const data=dataOf(m.voxels);for(let i=0;i<data.length;i+=2)grid[data[i]]=data[i+1];
  const mask=m.maskCells;if(mask)for(let i=0;i<mask.length;i+=2)grid[mask[i]]=mask[i+1];
  queue.clear();every();schedule();scheduleInvisible(true);
 }
 else if(m.type==='invisible'&&m.model===model){showInvisible=m.show;scheduleInvisible();}
 else if(m.type==='lighting'&&m.model===model){gameLighting=Boolean(m.game);epoch=m.epoch;queue.clear();every();schedule();}
 else if(m.type==='styles'&&m.model===model){epoch=m.epoch;styles=m.styles;fluidUV=m.fluidUV||{};queue.clear();every();schedule();}
 else if(m.type==='headSkins'&&m.model===model){
  const next=new Map(m.heads),same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
  for(const [c,v] of headSkins)if(!same(v,next.get(c)))dirtyCell(c);
  for(const [c,v] of next)if(!same(v,headSkins.get(c)))dirtyCell(c);
  for(const [c,s] of headSources)if(!same(next.get(s),headSkins.get(s)))dirtyCell(c);
  headSkins=next;schedule();
 }
 else if(m.type==='style'&&m.model===model){styles[m.id]=m.style;for(const c of m.cells)dirtyCell(c);schedule();}
 else if(m.type==='slice'&&m.model===model){epoch=m.epoch;mode=m.mode;layer=m.layer;queue.clear();every();schedule();scheduleInvisible(true);}
 else if(m.type==='brushState'&&m.model===model){brushId=m.id;brushState=m.state;brushColor=m.color;brushStyle=null;brushLiquid=liquidState(m.state);}
 else if(m.type==='brushStyle'&&m.model===model&&m.id===brushId){brushStyle=m.style;for(const c of preview.keys())dirtyCell(c);schedule();}
 else if(m.type==='transformPreview'&&m.model===model){
  const next=new Map(),sources=new Map(m.headSources);for(let i=0;i<m.data.length;i+=2)next.set(m.data[i],m.data[i+1]);
  for(const [c,s] of headSources)if(sources.get(c)!==s)dirtyCell(c);
  for(const [c,s] of sources)if(headSources.get(c)!==s)dirtyCell(c);headSources=sources;
  for(const c of preview.keys())if(!next.has(c)){preview.delete(c);dirtyCell(c);}
  for(const [c,v] of next)if(preview.get(c)!==v){preview.set(c,v);dirtyCell(c);}
  schedule();scheduleInvisible();
 }
 else if(m.type==='brushPreview'&&m.model===model){for(let i=0;i<m.data.length;i+=2){const c=m.data[i];preview.set(c,m.data[i+1]);dirtyCell(c);}schedule();scheduleInvisible();}
 else if(m.type==='brushClear'&&m.model===model){for(const c of preview.keys())dirtyCell(c);preview.clear();headSources.clear();brushId=-1;brushState=brushStyle=brushLiquid=null;schedule();scheduleInvisible();}
 else if(m.type==='patch'&&m.model===model){for(const {id,state,color} of m.added||[]){present[id]=!AIR.has(state.name);colors[id]=color;liquid[id]=liquidState(state);invisible[id]=invisibleStyle(state.name);}const data=dataOf(m.data);for(let i=0;i<data.length;i+=2){const cell=data[i];grid[cell]=data[i+1];dirtyCell(cell);}schedule();scheduleInvisible(true);}
};
