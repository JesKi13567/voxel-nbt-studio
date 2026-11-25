import {bindNbtCompletion,nbtCursor} from './nbt-completion.js';
import {nbtFields,nbtValues} from './mcdoc.js';

const el=(tag,cls,text)=>Object.assign(document.createElement(tag),{className:cls??'',textContent:text??''});
const defaults={String:'""',Byte:'0b',Short:'0s',Int:'0',Long:'0L',Float:'0f',Double:'0d',Compound:'{}',List:'[]','Byte[]':'[B;]','Int[]':'[I;]','Long[]':'[L;]'};
const raw=n=>n.kind==='value'?n.raw:n.kind==='object'?`{${n.children.map(c=>JSON.stringify(c.key)+':'+raw(c)).join(',')}}`:`[${n.array?n.array+';':''}${n.children.map(raw).join(',')}]`;
function node(text,key){
 const tree=nbtCursor(text,-1,true).tree;
 function quote(n){if(n.kind==='value'&&n.raw.startsWith("'"))n.raw=JSON.stringify(nbtCursor(n.raw,-1).data);else n.children?.forEach(quote);}
 quote(tree);return Object.assign(tree,{key});
}
const typeOf=n=>n.scalarType??(n.kind==='object'?'Compound':n.kind==='list'?(n.array?{B:'Byte[]',I:'Int[]',L:'Long[]'}[n.array]:'List'):
 /^"/.test(n.raw)?'String':({b:'Byte',s:'Short',l:'Long',f:'Float',d:'Double'}[n.raw.at(-1)?.toLowerCase()]??'Int'));
const $=id=>document.getElementById(id);

export function createNbtTree({prefix,scope,schema,blocked,apply,hints}){
 const host=$(prefix+'Form'),save=$(prefix+'Apply'),reset=$(prefix+'Reset'),error=$(prefix+'NbtError');
 const hidden=new Set(scope==='blockEntity'?['x','y','z']:['Pos']);
 const protectedKeys=new Set(['id',...hidden]);
 let data,root,changed,expanded;
 const buttons=()=>{host.disabled=blocked()||!root;save.disabled=host.disabled||!changed?.size;reset.disabled=save.disabled;};
 function context(path=[]){const ctx=data&&schema(data.dv);return ctx&&{ctx,root:scope,id:data.id,path,base:root?nbtCursor(raw(root),-1).data:data.data};}
 function change(path){changed.add(path[0]);buttons();}
 function button(text,label,action){const b=el('button','entity-nbt-button',text);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=action;return b;}
 function addObject(parent,path){
  const group=el('details','entity-nbt-add'),summary=el('summary','','+'),body=el('div','entity-nbt-picker');
  summary.title='添加字段';summary.setAttribute('aria-label','添加字段');group.append(summary,body);
  group.ontoggle=()=>{
   if(!group.open)return;
   const ctx=context(path),used=new Set(parent.children.map(c=>c.key));
   const suggested=new Map((ctx?nbtFields(ctx.ctx,ctx.root,ctx.base,path):[]).map(f=>[f.key,f]));
   for(const [id,,text,desc] of hints?.(data.id,data.dv)??[]){
    const parts=id.split('.'),key=parts.pop();
    if(parts.length===path.length&&parts.every((k,i)=>k===path[i])&&!suggested.has(key))suggested.set(key,{key,text,desc});
   }
   const fields=[...suggested.values()].filter(f=>!used.has(f.key)&&(path.length||!protectedKeys.has(f.key)));
   const select=el('select');select.setAttribute('aria-label','可添加字段');select.append(new Option('选择字段…',''),...fields.map(f=>{const o=new Option(f.key,f.key);o.title=f.desc??'';return o;}));
   const put=(key,text)=>{const child=node(text,key);parent.children.push(child);if(child.kind!=='value')expanded.add(child);change([...path,key]);render();};
   select.onchange=()=>{const f=fields.find(f=>f.key===select.value);if(f)put(f.key,f.text==='[{}]'?'[]':f.text);};
   const input=el('input'),kind=el('select');input.placeholder='自定义键名';input.setAttribute('aria-label','自定义键名');kind.setAttribute('aria-label','NBT 类型');kind.append(...Object.keys(defaults).map(t=>new Option(t,t)));
   const add=button('＋','添加自定义字段',()=>{const key=input.value;
    input.setCustomValidity(!key?'请输入键名':used.has(key)||!path.length&&protectedKeys.has(key)?'字段已存在或由编辑器管理':'');
    if(input.reportValidity())put(key,defaults[kind.value]);
   });input.oninput=()=>input.setCustomValidity('');body.replaceChildren(select,input,kind,add);
  };
  return group;
 }
 function listText(list,path){
  if(list.array)return defaults[{B:'Byte',I:'Int',L:'Long'}[list.array]];
  const ctx=context(path),samples=ctx?nbtValues(ctx.ctx,ctx.root,ctx.base,path):[];
  const first=list.children[0];return (first?samples.find(v=>typeOf(node(v.text))===typeOf(first)):samples[0])?.text??defaults[first?typeOf(first):'String'];
 }
 function addList(list,path){
  const row=el('div','entity-nbt-add-list'),add=button('＋ 条目','添加列表条目',()=>{
   const index=list.children.length,child=node(listText(list,[...path,index]),index);list.children.push(child);
   if(child.kind!=='value')expanded.add(child);change(path);render();
  });row.append(add);
  if(!list.array){
   const chooser=el('select');chooser.setAttribute('aria-label','指定条目类型');chooser.append(new Option('指定类型…',''),...Object.keys(defaults).map(t=>new Option(t,t)));
   chooser.onchange=()=>{if(!chooser.value)return;const child=node(defaults[chooser.value],list.children.length);list.children.push(child);if(child.kind!=='value')expanded.add(child);change(path);render();};row.append(chooser);
  }
  return row;
 }
 function valueControl(n,path){
  const type=typeOf(n),str=type==='String';n.scalarType=type;
  const label=path.join(' / ');
  if((type==='Byte'&&/^[01]b$/.test(n.raw))||str&&scope==='blockEntity'){
   const c=context(path),values=c?nbtValues(c.ctx,c.root,c.base,path):[];
   const choices=type==='Byte'?values.length===2&&values.every(v=>/^[01]b$/.test(v.text)):
    values.length>=2&&values.length<=12&&values.every(v=>v.type===8&&v.text!=='""');
   if(choices){
    const select=el('select','entity-nbt-input');select.setAttribute('aria-label',label);
    const value=text=>str?JSON.parse(text):text;
    select.append(...[...new Set([...values.map(v=>v.text),n.raw])].map(text=>new Option(value(text),value(text))));
    select.value=value(n.raw);
    select.onchange=()=>{n.raw=str?JSON.stringify(select.value):select.value;change(path);};return select;
   }
  }
  const input=el('input','entity-nbt-input');input.spellcheck=false;
  input.value=str?JSON.parse(n.raw):n.raw;input.setAttribute('aria-label',path.join(' / '));
  const suffix=/[bsLfd]$/.test(defaults[type])?defaults[type].at(-1):'';
  input.oninput=()=>{
   const text=input.value.trim().replace(new RegExp(suffix?suffix+'$':'(?!)','i'),'');
   const rule=type==='Float'||type==='Double'?/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i:/^[+-]?\d+$/;
   n.raw=str?JSON.stringify(input.value):text+suffix;
   n.invalid=!str&&!rule.test(text);input.setCustomValidity(n.invalid?'请输入 '+type+' 数值':'');change(path);
  };
  if(n.invalid)input.setCustomValidity('请输入 '+type+' 数值');
  bindNbtCompletion(input,()=>{const ctx=context(path);return ctx&&{...ctx,stringInput:str};});return input;
 }
 function children(target,parent,path){
  for(const [i,n] of parent.children.entries()){
   const key=parent.kind==='list'?i:n.key;if(!path.length&&hidden.has(key))continue;
   const p=[...path,key],branch=n.kind!=='value',locked=!path.length&&protectedKeys.has(key),h=el(branch?'summary':'div','entity-nbt-line');
   const name=el('span','entity-nbt-name',String(key));name.title=String(key);
   h.append(name,el('span','entity-nbt-type',typeOf(n)));
   if(branch)h.append(el('span','entity-nbt-count',String(n.children.length)));
   else h.append(locked?el('span','entity-nbt-count',JSON.parse(n.raw)):valueControl(n,p));
   if(!locked){
    const actions=el('span','entity-nbt-actions');
    const move=d=>{const a=parent.children;[a[i],a[i+d]]=[a[i+d],a[i]];change(path);render();};
    if(parent.kind==='list'){
     const up=button('↑','上移列表条目',e=>{e.preventDefault();move(-1);}),down=button('↓','下移列表条目',e=>{e.preventDefault();move(1);});
     up.disabled=i===0;down.disabled=i===parent.children.length-1;actions.append(up,down);
    }
    actions.append(button('−',`移除 ${key}`,e=>{e.preventDefault();parent.children.splice(i,1);change(p);render();}));h.append(actions);
   }
   if(!branch){target.append(h);continue;}
   const group=el('details','entity-nbt-branch'),body=el('div','entity-nbt-children');group.append(h,body);group.open=expanded.has(n);
   const build=()=>{if(!body.hasChildNodes())children(body,n,p);};if(group.open)build();
   group.ontoggle=()=>{if(!group.isConnected)return;if(group.open){expanded.add(n);build();}else expanded.delete(n);};target.append(group);
  }
  if(parent.kind==='object')target.append(addObject(parent,path));
  else if(parent.kind==='list')target.append(addList(parent,path));
 }
 function render(){host.replaceChildren();if(root)children(host,root,[]);buttons();}
 function load(next,force=false){
  if(!force&&next?.revision&&next.revision===data?.revision)return;
  data=next;root=null;changed=new Set();expanded=new WeakSet();error.textContent='';
  if(next)try{
   if(!next.text)throw new Error('此 NBT 无法安全展开，请使用高级 SNBT。');
   root=node(next.text);
  }catch(e){host.replaceChildren(el('small','',e.message));buttons();return;}
  render();
 }
 save.onclick=()=>{
  if(save.disabled)return;
  const invalid=n=>n.invalid||n.children?.some(invalid);
  if(root.children.some(invalid)){error.textContent='有数值字段格式错误，请检查后再应用。';return;}
  error.textContent='';
  apply([...changed].map(key=>{const n=root.children.find(c=>c.key===key);return n?{key,text:raw(n)}:{key,remove:true};}),data);
 };
 reset.onclick=()=>load(data,true);
 return {load,buttons,context,reset:reset.onclick};
}
