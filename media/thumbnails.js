const pixels=48;
const tris=[0,1,2,0,2,3];
const cube=[
 [[1,0,0],[1,1,0],[1,1,1],[1,0,1],.81],
 [[0,0,1],[0,1,1],[0,1,0],[0,0,0],.67],
 [[0,1,1],[1,1,1],[1,1,0],[0,1,0],1],
 [[0,0,0],[1,0,0],[1,0,1],[0,0,1],.50],
 [[1,0,1],[1,1,1],[0,1,1],[0,0,1],.90],
 [[0,0,0],[0,1,0],[1,1,0],[1,0,0],.74]
];
const mul=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
const right=[Math.SQRT1_2,0,-Math.SQRT1_2],up=[-.353553,.866025,-.353553],back=[.612372,.5,.612372];
function fitted(vertices){
 let xmin=Infinity,ymin=Infinity,zmin=Infinity,xmax=-Infinity,ymax=-Infinity,zmax=-Infinity;
 for(let i=0;i<vertices.length;i+=8){const pos=vertices.slice(i,i+3),x=mul(right,pos),y=mul(up,pos),z=mul(back,pos);
  xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);}
 const s=1.65/Math.max(1.30,xmax-xmin,ymax-ymin),d=-1.7/Math.max(1,zmax-zmin);
 return new Float32Array([right[0]*s,up[0]*s,back[0]*d,0,right[1]*s,up[1]*s,back[1]*d,0,right[2]*s,up[2]*s,back[2]*d,0,-s*(xmax+xmin)/2,-s*(ymax+ymin)/2,-d*(zmax+zmin)/2,1]);
}
export class Thumbnails {
 constructor(gl,bind,matrix){
  this.gl=gl;this.bind=bind;this.matrix=matrix;
  this.cache=new Map();this.queue=[];this.buffer=gl.createBuffer();this.fbo=gl.createFramebuffer();
  const rgba=gl.createTexture(),depth=gl.createRenderbuffer();gl.bindTexture(gl.TEXTURE_2D,rgba);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,pixels,pixels,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for(const target of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,target,gl.NEAREST);
  gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,pixels,pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,rgba,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  this.ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 show(button,state,color,materials){
  if(!this.ok)return;
  const key=(materials?'m':'s')+state.name+JSON.stringify(Object.entries(state.props).sort());
  if(!this.cache.has(key)){
   const job=this.prepare(state,color,materials).then(data=>this.enqueue(data)).catch(()=>null);
   this.cache.set(key,job);if(this.cache.size>480)this.cache.delete(this.cache.keys().next().value);
  }
  this.cache.get(key).then(src=>{if(src&&button.isConnected){const canvas=document.createElement('canvas');canvas.width=canvas.height=pixels;canvas.getContext('2d').putImageData(src,0,0);canvas.setAttribute('aria-hidden','true');button.replaceChildren(canvas);button.style.backgroundColor='';}});
 }
 async prepare(state,color,materials){
  const fluid=state.name==='minecraft:lava'?'lava':['minecraft:water','minecraft:bubble_column'].includes(state.name)?'water':null;
  const style=materials&&!fluid?await materials.state(state):null;
  const uv=materials&&fluid?materials.fluidUV()[fluid]:null;
  if(materials)await materials.idle();
  const vertices=[];
  if(style)for(const {v} of style.quads)for(const i of tris)vertices.push(...v.slice(i*8,i*8+8));
  else {
   const h=fluid?[.8875,.78125,.65625,.5625,.4375,.33125,.23125,.11875][+state.props.level]??1:1;
   const c=uv?(fluid==='water'?[.31,.55,.95]:[1,1,1]):color;
   for(const [side,face] of cube.entries())for(const i of tris){const p=face[i],r=uv?.[(side>>1)===1?0:1],s=(side>>1)===0?p[2]:p[0],t=(side>>1)===1?p[2]:1-p[1]*h;
    vertices.push(p[0],p[1]*h,p[2],...c.map(n=>n*face[4]),r?r[0]+(r[2]-r[0])*(.002+.996*s):-1,r?r[1]+(r[3]-r[1])*(.002+.996*t):-1);}
  }
  return {vertices,texture:materials?.texture};
 }
 enqueue(data){return new Promise(done=>{this.queue.push({data,done});this.schedule();});}
 schedule(){if(!this.raf)this.raf=requestAnimationFrame(()=>{this.raf=0;const started=performance.now();
  for(let i=0;i<5&&this.queue.length;i++){const {data,done}=this.queue.shift();try{done(this.render(data));}catch{done(null);}if(performance.now()-started>7)break;}
  if(this.queue.length)this.schedule();});}
 render({vertices,texture}){
  const {gl}=this;if(!vertices.length||gl.isContextLost())return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);
  try{
   gl.viewport(0,0,pixels,pixels);gl.clearColor(0,0,0,0);gl.clear(gl.DEPTH_BUFFER_BIT|gl.COLOR_BUFFER_BIT);
   gl.uniformMatrix4fv(this.matrix,false,fitted(vertices));gl.bindTexture(gl.TEXTURE_2D,texture??null);
   this.bind(this.buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices instanceof Float32Array?vertices:new Float32Array(vertices),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/8);
   const bytes=new Uint8Array(pixels*pixels*4);gl.readPixels(0,0,pixels,pixels,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
   const image=new ImageData(pixels,pixels);for(let y=0;y<pixels;y++){const from=(pixels-1-y)*pixels*4;image.data.set(bytes.subarray(from,from+pixels*4),y*pixels*4);}return image;
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(.082,.105,.145,1);}
 }
}
