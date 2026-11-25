export const identityAxes=()=>[[1,0,0],[0,1,0],[0,0,1]];
export const blueprintPoint=(p,{origin,axes})=>origin.map((n,i)=>n+axes.reduce((v,a,j)=>v+a[i]*p[j],0));
export const templateAnchor=(size,mode)=>mode==='corner'?[0,0,0]:[Math.floor((size[0]-1)/2),0,Math.floor((size[2]-1)/2)];
export const anchorOrigin=(point,local,axes)=>point.map((n,i)=>n-axes.reduce((v,a,j)=>v+a[i]*local[j],0));
export function blueprintMatrix(m,{origin,axes}){
 const shift=origin.map((n,i)=>n+.5-axes.reduce((v,a)=>v+a[i]*.5,0));
 const col=(v,w)=>Array.from({length:4},(_,i)=>v.reduce((s,x,j)=>s+x*m[j*4+i],w*m[12+i]));
 return new Float32Array([...axes.flatMap(a=>col(a,0)),...col(shift,1)]);
}
const faces=[[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],[[0,0,1],[0,0,0],[1,0,0],[1,0,1]],[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]];
export function drawTemplateThumb(canvas,meta,color){
 const ctx=canvas.getContext('2d');if(!ctx||!meta.thumb.length)return;
 const [w,h,d]=meta.size,scale=43/Math.max(w+d,h+(w+d)*.5,1),ox=32+(d-w)*scale*.5,oy=32+(h-(w+d)*.5)*scale*.5;
 const at=(x,y,z)=>[ox+(x-z)*scale,oy+((x+z)*.5-y)*scale];
 const colors=meta.states.map(color),rows=[...meta.thumb].sort((a,b)=>a[0]+a[1]+a[2]-b[0]-b[1]-b[2]);
 for(const [x,y,z,id] of rows){
  const name=meta.states[id]?.name,red=id<0||name==='minecraft:structure_void',air=/^minecraft:(?:air|cave_air|void_air)$/.test(name),scale=red?.125:air?.25:1,offset=(1-scale)/2;
  const rgb=red?[1,.25,.25]:air?[.62,.52,1]:(colors[id]||[.4,.65,1]);
  for(const [face,factor] of [[0,.77],[4,.61],[2,1]]){
   ctx.beginPath();for(const [i,p] of faces[face].entries())ctx[i?'lineTo':'moveTo'](...at(x+offset+p[0]*scale,y+offset+p[1]*scale,z+offset+p[2]*scale));ctx.closePath();
   ctx.fillStyle=`rgb(${rgb.map(n=>Math.round(n*factor*255)).join(',')})`;ctx.fill();
  }
 }
}
