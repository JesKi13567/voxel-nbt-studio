// Clip in homogeneous coordinates so edges that cross the camera plane stay finite.
export function clipPoint(m,[x,y,z]){
 return [0,1,2,3].map(i=>m[i]*x+m[i+4]*y+m[i+8]*z+m[i+12]);
}
export function clipSegment(a,b){
 let lo=0,hi=1;
 for(let i=0;i<3;i++)for(const sign of [-1,1]){
  const u=a[3]+sign*a[i],v=b[3]+sign*b[i];
  if(u<0&&v<0)return null;
  if((u<0)!==(v<0)){
   const t=u/(u-v);if(u<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
   if(lo>hi)return null;
  }
 }
 const at=t=>{const w=a[3]+(b[3]-a[3])*t;return w>0?[0,1,2].map(i=>(a[i]+(b[i]-a[i])*t)/w):null;};
 const first=at(lo),last=at(hi);return first&&last?[first,last]:null;
}
