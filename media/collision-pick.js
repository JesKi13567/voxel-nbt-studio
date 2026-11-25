// The selected client JAR provides collision shapes, or selection outlines when collision is empty.
const EPS=1e-9;
export function collisionIndex({blocks,shapes}){
 const before=[0,0,0],after=[0,0,0];
 for(const shape of shapes){
  const start=shape.length%6,[h,v,x,z]=start?shape:[0,0,0,0];
  const lower=[-h-x,0,-h-z],upper=[h-x,v,h-z];
  for(let i=start;i<shape.length;i+=6)for(let a=0;a<3;a++){
   before[a]=Math.max(before[a],Math.ceil(-shape[i+a]-lower[a]-EPS));
   after[a]=Math.max(after[a],Math.ceil(shape[i+a+3]+upper[a]-1-EPS));
  }
 }
 const map=new WeakMap();
 const offsets=[];
 for(let z=-after[2];z<=before[2];z++)for(let y=-after[1];y<=before[1];y++)for(let x=-after[0];x<=before[0];x++)offsets.push([x,y,z]);
 return {before,after,offsets,shape(state){
  if(!state)return null;
  if(map.has(state))return map.get(state);
  const row=Object.hasOwn(blocks,state.name)?blocks[state.name]:undefined;
  const key=Array.isArray(row)?row[1].map((n,i)=>state.props[n]??row[2][i]).join(','):null;
  const result=shapes[key===null?row:row[3][key]??row[0]]??null;map.set(state,result);return result;
 }};
}
function offset([x,y,z],shape){
 // Java's Mth.getSeed(x, 0, z): the x multiply overflows an int before conversion to long.
 const n=BigInt(Math.imul(x,3129871))^(BigInt(z)*116129781n);
 const seed=Number((n*n*42317861n+n*11n)>>16n&4095n),[h,v,ox,oz]=shape;
 const shift=n=>Math.max(-h,Math.min(h,(Math.fround((n&15)/15)-.5)*.5));
 return [x+shift(seed)-ox,y+Math.fround((seed>>4&15)/15)*v,z+shift(seed>>8)-oz];
}
export function hitCollision(eye,d,p,shape){
 const start=shape.length%6,origin=start?offset(p,shape):p;
 let best=null;
 for(let i=start;i<shape.length;i+=6){
  let lo=0,hi=Infinity,face=-1;
  for(let a=0;a<3;a++){
   const min=origin[a]+shape[i+a]-eye[a],max=origin[a]+shape[i+3+a]-eye[a];
   if(Math.abs(d[a])<EPS){if(min>EPS||max<-EPS){hi=-1;break;}continue;}
   const u=min/d[a],v=max/d[a],entry=Math.min(u,v);if(entry>lo||entry===lo&&face<0){lo=entry;face=a;}hi=Math.min(hi,Math.max(u,v));
   if(hi<lo-EPS)break;
  }
  if(hi>=lo-EPS&&hi>EPS&&(!best||lo<best.distance)){
   const n=[0,0,0];if(face>=0)n[face]=-Math.sign(d[face]);best={p,n,distance:lo};
  }
 }
 return best;
}
export function traceCollision({eye,d},size,index,at){
 if(!d.some(v=>Math.abs(v)>=EPS))return null;
 const {before,after,offsets}=index;let from=0,to=Infinity;
 for(let a=0;a<3;a++){
  const min=-before[a],max=size[a]+after[a];
  if(Math.abs(d[a])<EPS){if(eye[a]<min||eye[a]>=max)return null;continue;}
  const u=(min-eye[a])/d[a],v=(max-eye[a])/d[a];from=Math.max(from,Math.min(u,v));to=Math.min(to,Math.max(u,v));
 }
 if(to<=from)return null;
 const p=eye.map((v,a)=>Math.floor(v+d[a]*(from+EPS*2))),step=d.map(v=>Math.abs(v)<EPS?0:Math.sign(v)),delta=d.map(v=>Math.abs(1/v));
 const next=step.map((s,a)=>s?(p[a]+(s>0?1:0)-eye[a])/d[a]:Infinity);
 let best=null;
 const seen=new Set();
 while(from<=to+EPS){
  for(const o of offsets){
   const q=p.map((n,a)=>n+o[a]);
   if(q.some((n,a)=>n<0||n>=size[a]))continue;
   const key=(q[1]*size[2]+q[2])*size[0]+q[0];if(seen.has(key))continue;seen.add(key);
   const shape=at(q);if(!shape?.length)continue;
   const hit=hitCollision(eye,d,q,shape);
   if(hit&&(!best||hit.distance<best.distance-EPS))best=hit;
  }
  const a=next[0]<=next[1]&&next[0]<=next[2]?0:next[1]<=next[2]?1:2;
  if(best&&best.distance<=next[a]+EPS)break;
  from=next[a];next[a]+=delta[a];p[a]+=step[a];
 }
 return best;
}
