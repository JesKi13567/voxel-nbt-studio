// Read-only projection of the upstream schema. It never validates away unknown NBT.
const kinds={boolean:1,byte:1,short:2,int:3,long:4,float:5,double:6,byte_array:7,string:8,list:9,tuple:9,struct:10,int_array:11,long_array:12};
const defaults=['','0b','0s','0','0L','0f','0d','[B;]','""','[]','{}','[I;]','[L;]'];
const arrayKinds={byte_array:'byte',int_array:'int',long_array:'long'};
const leaf=kind=>({kind}),unknown=leaf('any');
const own=(v,key)=>v!=null&&Object.hasOwn(v,key)?v[key]:undefined;
const attr=(n,k)=>n?.attributes?.find(a=>a.name===k)?.value;
const literal=n=>n?.kind==='literal'?n.value?.value:undefined;
function compared(a,b){const nums=s=>String(s).match(/\d+/g)?.slice(0,3).map(Number)??[];const x=nums(a),y=nums(b);for(let i=0;i<3;i++){const n=(x[i]??0)-(y[i]??0);if(n)return n;}return 0;}
const game=catalog=>catalog.source.game;
export function versionAt(catalog,dv){
 if(!Number.isInteger(dv))return game(catalog);
 let a=0,b=catalog.version.length;while(a<b){const m=(a+b)>>1;if(catalog.version[m][0]<=dv)a=m+1;else b=m;}
 return catalog.version[Math.max(0,a-1)]?.[1]??game(catalog);
}
const enabled=(n,version)=>{const s=literal(attr(n,'since')),u=literal(attr(n,'until'));return (!s||compared(version,s)>=0)&&(!u||compared(version,u)<0);};
const prefix=id=>id.includes(':')?id:'minecraft:'+id;
function registryFor(node){const a=attr(node,'id');return literal(a)??literal(a?.values?.registry);}
function readIndex(q,f){
 if(q.kind==='static')return q.value;
 let v=f?.value;const steps=q.accessor??[];
 if(typeof steps[0]==='string'&&!Object.hasOwn(v??{},steps[0])&&f?.parent)v=f.parent.value;
 for(const k of steps){
  if(k?.keyword==='parent'){f=f?.parent;v=f?.value;}
  else if(k?.keyword==='key')v=f?.key;
  else if(typeof k==='string')v=own(v,k);
 }
 return v;
}
function blockProperties(context,i){
 const states=own(context.states,i?.includes(':')?i:'minecraft:'+i)??{};
 return {kind:'struct',fields:Object.entries(states).map(([key,p])=>({key,kind:'pair',type:{kind:'enum',enumKind:'string',values:p.values.map(value=>({value}))},optional:true}))};
}
function expand(node,ctx,frame,bindings={},depth=0){
 if(!node||depth>28||!enabled(node,ctx.version))return [];
 const next=(value,local=bindings)=>expand(value,ctx,frame,local,depth+1);
 switch(node.kind){
  case 'reference':return own(bindings,node.path)?next(bindings[node.path]):next(own(ctx.catalog.types,node.path));
  case 'concrete':{
   const t=node.child?.kind==='reference'?own(ctx.catalog.types,node.child.path):node.child;
   return t?.kind==='template'?next(t.child,{...bindings,...Object.fromEntries(t.typeParams.map((p,i)=>{const v=node.typeArgs[i];return [p.path,v?.kind==='reference'?own(bindings,v.path)??v:v];}))}):next(t);
  }
  case 'template':return next(node.child);
  case 'union':return node.members.flatMap(v=>next(v));
  case 'indexed':return next(node.child);
  case 'dispatcher':{
   const selected=node.parallelIndices?.map(v=>readIndex(v,frame)).find(v=>typeof v==='string');
   if(node.registry==='mcdoc:block_states')return [{node:blockProperties(ctx,selected),bindings}];
   const t=own(ctx.catalog.dispatch,node.registry),key=selected?.replace(/^minecraft:/,'');
   const found=own(t,key)??own(t,selected)??own(t,'%fallback');
   if(found)return next(found);
   if(node.registry==='minecraft:entity')return next(own(ctx.catalog.types,'::java::world::entity::EntityBase'));
   return [];
  }
  default:return [{node,bindings}];
 }
}
function keysFor({node},ctx){
 if(node.kind==='literal')return [node.value.value];
 if(node.kind==='enum')return node.values.filter(v=>enabled(v,ctx.version)).map(v=>v.value);
 const reg=registryFor(node)?.replace(/^minecraft:/,''),ids=own(ctx.catalog.registries,reg);
 if(!ids)return [];
 const v=attr(node,'id')?.values,omit=new Set(Object.values(v?.exclude?.values??{}).map(literal));
 const mark=literal(v?.prefix)??'';return ids.filter(i=>!omit.has(i)).map(id=>mark+prefix(id));
}
function fields(variants,ctx,f,depth=0){
 const result=new Map();if(depth>16)return result;
 const add=(key,type,bindings,desc)=>{
  if(typeof key!=='string')return;
  const a=result.get(key)??{desc,options:[]};a.options.push({type,bindings});result.set(key,a);
 };
 for(const {node,bindings} of variants){if(node.kind!=='struct')continue;
  for(const entry of node.fields){if(!enabled(entry,ctx.version))continue;
   if(entry.kind==='spread')for(const [k,r] of fields(expand(entry.type,ctx,f,bindings),ctx,f,depth+1))for(const opt of r.options)add(k,opt.type,opt.bindings,r.desc);
   else if(typeof entry.key==='string')add(entry.key,entry.type,bindings,entry.desc);
   else for(const k of expand(entry.key,ctx,f,bindings).flatMap(n=>keysFor(n,ctx)))add(k,entry.type,bindings,entry.desc);
  }
 }
 return result;
}
function atPath(ctx,root,data,path,seed){
 let options=[{type:ctx.catalog.roots[root]??unknown,bindings:{}}],f={value:data,seed};
 for(const k of path){
  const resolved=options.flatMap(({type,bindings})=>expand(type,ctx,f,bindings)),child={key:k,parent:f,value:own(f.value,k)};
  if(typeof k==='number')options=resolved.flatMap(({node,bindings})=>{
   const kind=arrayKinds[node.kind];
   const type=node.kind==='list'?node.item:node.kind==='tuple'?node.items[k]:kind?leaf(kind):null;
   return type?[{type,bindings}]:[];
  });
  else options=fields(resolved,ctx,f).get(k)?.options??[];
  f=child;
 }
 return {resolved:options.flatMap(({type,bindings})=>expand(type,ctx,f,bindings)),frame:f};
}
const numeric=new Set(['byte','short','int','long','float','double']);
const scalar=(kind,value)=>typeof value==='string'?JSON.stringify(value):kind==='boolean'?(value?'1b':'0b'):String(value)+({byte:'b',short:'s',long:'L',float:'f',double:'d'}[kind]??'');
const keyText=key=>/^[A-Za-z0-9_.+-]+$/.test(key)?key:JSON.stringify(key);
function examples(variants,ctx,f,depth=0,includeIds=false){
 const output=[],seen=new Set();
 const put=(type,text,label=text)=>{if(!seen.has(text)){seen.add(text);output.push({type,text,label});}};
 for(const {node,bindings} of variants){
  const k=node.kind==='enum'?node.enumKind:node.kind==='literal'?node.value.kind:node.kind,t=kinds[k];
  if(node.kind==='enum'||node.kind==='literal')for(const value of keysFor({node},ctx))put(t,scalar(k,value),String(value));
  else if(k==='boolean'){put(1,'0b');put(1,'1b');}
  else if(k==='string'&&includeIds){for(const id of keysFor({node},ctx))put(t,JSON.stringify(id),id);if(!output.length)put(t,'""');}
  else if(k==='struct')put(t,'{}','Compound');
  else if(k==='list'){
   const element=expand(node.item,ctx,{parent:f,key:0},bindings);
   put(t,'[]','List');
   if(depth<2&&element.some(e=>e.node.kind==='struct'))put(t,'[{}]','List · 新增条目');
   else if(depth<2&&node.lengthRange?.min>0&&node.lengthRange.min<=16){
    const sample=examples(element,ctx,f,depth+1)[0]?.text;if(sample!==undefined)put(t,`[${Array(node.lengthRange.min).fill(sample).join(',')}]`);
   }
  }else if(own(arrayKinds,k)&&depth<2&&Number.isInteger(node.lengthRange?.min)&&node.lengthRange.min>0&&node.lengthRange.min<=16){
   const template=defaults[t],sample=scalar(arrayKinds[k],0);put(t,`${template.slice(0,-1)}${Array(node.lengthRange.min).fill(sample).join(',')}]`);
  }else if(k==='tuple'&&depth<2)put(t,`[${node.items.map((n,i)=>examples(expand(n,ctx,{parent:f,key:i},bindings),ctx,f,depth+1)[0]?.text??'0').join(',')}]`);
  else if(t){const min=node.valueRange?.min??0;put(t,numeric.has(k)?scalar(k,Math.max(0,min+(node.valueRange?.kind===1?1:0))):defaults[t]);}
 }
 return output;
}
export function schemaContext(catalog,dv,states={}){return {catalog,version:versionAt(catalog,dv),states};}
export function withOwner(data,id){return id&&!own(data,'id')?{...data,id}:data??{};}
export function nbtFields(ctx,root,data,path=[]){
 const {resolved,frame}=atPath(ctx,root,data,path);
 const list=[];
 for(const [key,{desc,options}] of fields(resolved,ctx,frame)){
  const child={key,parent:frame,value:own(frame.value,key)},types=options.flatMap(({type,bindings})=>expand(type,ctx,child,bindings));
  const samples=examples(types,ctx,child);const e=samples.every(v=>v.type===9)?samples.find(v=>v.text==='[{}]')??samples[0]:samples[0];
  if(e)list.push({key,type:e.type,text:e.text,desc});
 }return list;
}
export function nbtValues(ctx,root,data,path){const {resolved,frame}=atPath(ctx,root,data,path);return examples(resolved,ctx,frame,0,true);}
