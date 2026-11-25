import {BlockModel,mat4} from './model-engine.js';

const bakeElement=BlockModel.prototype.getElementMesh;
const radians=Math.PI/180;

// The bundled renderer handles axis/angle, but newer client models also allow X/Y/Z angles.
function getElementMesh(element,...args){
 const r=element.rotation;
 if(!r||r.axis!==undefined||![r.x,r.y,r.z].some(Number.isFinite))return bakeElement.call(this,element,...args);
 const origin=r.origin??[8,8,8],m=mat4.create();
 mat4.translate(m,m,origin);
 mat4.rotateZ(m,m,(r.z??0)*radians);
 mat4.rotateY(m,m,(r.y??0)*radians);
 mat4.rotateX(m,m,(r.x??0)*radians);
 if(r.rescale)mat4.scale(m,m,[0,4,8].map(i=>1/Math.max(Math.abs(m[i]),Math.abs(m[i+1]),Math.abs(m[i+2]))));
 mat4.translate(m,m,origin.map(n=>-n));
 return bakeElement.call(this,{...element,rotation:undefined},...args).transform(m);
}

export function clientBlockModel(raw){
 const model=BlockModel.fromJson(raw);
 model.getElementMesh=getElementMesh;
 return model;
}
