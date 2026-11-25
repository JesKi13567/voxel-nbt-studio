import {nbtFields,nbtValues} from './mcdoc.js';

// Reading completion context and lossless typed tokens. The backend validates every edit.
export function nbtCursor(text,cursor,capture=false){
 let i=0,mark=null,root=null,budget=3000;
 const ws=()=>{const start=i;while(i<text.length&&/\s/.test(text[i]))i++;return start;};
 const place=(a,z,mode,path,extra={})=>{if(cursor>=a&&cursor<=z)mark={mode,path,start:cursor,end:cursor,query:'',...extra};};
 function token(valueToken=false){
  const start=i,quote=text[i]==='"'||text[i]==="'"?text[i++]:null;let value='';
  if(quote){while(i<text.length){const c=text[i++];if(c===quote)break;if(c==='\\'&&i<text.length)value+=text[i++];else value+=c;}}
  else {while(i<text.length&&(valueToken&&text[i]===':'||/[^\s:{}\[\],;]/.test(text[i])))i++;value=text.slice(start,i);}
  if(quote==='"')try{value=JSON.parse(text.slice(start,i));}catch{}
  return {start,end:i,value};
 }
 function atToken(t,mode,path,extra={}){place(t.start,t.end,mode,path,{...extra,start:t.start,end:t.end,query:text.slice(t.start,cursor).replace(/^["']|["']$/g,'')});}
 function read(path,depth,owner,key){
  if(depth>64)return null;
  const a=ws();place(a,i,'value',path);const c=text[i];
  if(!c)return null;
  let node;
  if(capture){
   if(--budget<0||depth>32)throw new Error('NBT 太大，请使用 SNBT 源码编辑');
   node={key,kind:c==='{'?'object':c==='['?'list':'value'};
   if(node.kind!=='value')node.children=[];
   if(owner)owner.children.push(node);else root=node;
  }
  if(c==='{'){
   const value=Object.create(null);i++;
   while(i<=text.length){
    const start=ws();place(start,i,'key',path,{container:value});if(!text[i]||text[i]==='}')break;
    const k=token();if(k.start===k.end)break;
    ws();const hasColon=text[i]===':';atToken(k,'key',path,{container:value,existing:k.value,hasColon});
    if(hasColon){i++;value[k.value]=read([...path,k.value],depth+1,node,k.value);}
    ws();if(text[i]!==',')break;i++;
   }
   if(text[i]==='}')i++;return value;
  }
  if(c==='['){
   const value=[];i++;ws();if(/^[BILbil]\s*;/.test(text.slice(i,i+8))){if(node)node.array=text[i].toUpperCase();while(i<text.length&&text[i++]!==';'){} }
   while(i<=text.length){const start=ws();place(start,i,'value',[...path,value.length]);if(!text[i]||text[i]===']')break;
    const pos=i;value.push(read([...path,value.length],depth+1,node,value.length));if(pos===i)break;ws();if(text[i]!==',')break;i++;
   }
   if(text[i]===']')i++;return value;
  }
  const t=token(true);if(t.end>t.start)atToken(t,'value',path);
  if(node)node.raw=text.slice(t.start,t.end);
  return t.value;
 }
 const data=read([],0);return capture?{data,mark,tree:root}:{data,mark};
}
function ranked(rows,query){
 const q=query.toLowerCase();return rows.filter(r=>r.label.toLowerCase().includes(q)||r.text.toLowerCase().includes(q)).sort((a,b)=>{
  const rank=x=>x.label.toLowerCase().startsWith(q)||x.label.toLowerCase().replace(/^minecraft:/,'').startsWith(q)?0:1;
  return rank(a)-rank(b);
 }).slice(0,36);
}
const fieldKey=k=>/^[A-Za-z0-9_.+-]+$/.test(k)?k:JSON.stringify(k);
function overlay(value,path,local){
 if(!path.length)return local;
 const key=path[0],copy=typeof key==='number'?(Array.isArray(value)?value.slice():[]):{...value};
 Object.defineProperty(copy,key,{value:overlay(value?.[key],path.slice(1),local),enumerable:true,configurable:true,writable:true});return copy;
}
export function completionAt(text,cursor,{ctx,root,path=[],base=null,id,forbid=[]}){
 const parsed=nbtCursor(text,cursor),m=parsed.mark;if(!m)return null;
 let data=overlay(base,path,parsed.data);
 if(root!=='structure'&&id&&(!data||!Object.hasOwn(data,'id')))data={...data,id};
 const target=[...path,...m.path];let choices;
 if(m.mode==='key'){
  choices=nbtFields(ctx,root,data,target).filter(f=>(target.length||!forbid.includes(f.key))&&(f.key===m.existing||!Object.hasOwn(m.container,f.key)))
   .map(f=>({label:f.key,text:fieldKey(f.key)+(m.hasColon?'':`: ${f.text}`),detail:f.desc}));
 }else choices=nbtValues(ctx,root,data,target);
 return {start:m.start,end:m.end,choices:ranked(choices,m.query)};
}

const completions=new WeakMap();let serial=0;
export function bindNbtCompletion(input,context){
 return bindCompletion(input,()=>{
  const c=context();if(!c)return null;
  return c.stringInput?{start:0,end:input.value.length,choices:ranked(nbtValues(c.ctx,c.root,c.base,c.path).filter(v=>v.type===8&&v.text!=='""').map(v=>({...v,text:JSON.parse(v.text)})),input.value)}:completionAt(input.value,input.selectionStart,c);
 });
}
export function bindCompletion(input,getResult,{tab=false,label='NBT 补全建议'}={}){
 if(!input||completions.has(input))return completions.get(input);
 const menu=document.createElement('div');menu.id='nbt-completion-'+ ++serial;menu.className='nbt-completion';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label);
 menu.setAttribute('popover','manual');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',menu.id);
 let result=null,selected=-1;
 function close(){if(menu.matches(':popover-open'))menu.hidePopover();input.removeAttribute('aria-activedescendant');result=null;}
 function pick(i){const option=result?.choices[i];if(!option)return;
  const {start,end}=result;close();
  if(option.action){option.action({start,end});return;}
  input.setRangeText(option.text,start,end,'end');
  if(option.caret!==undefined)input.setSelectionRange(start+option.caret,start+option.caret);
  input.dispatchEvent(new Event('input',{bubbles:true}));close();
 }
 function show(force=false){
  if(input.readOnly||input.disabled||!force&&input.value.length>500000){close();return;}
  result=getResult();
  if(!result?.choices.length){close();return;}
  if(!menu.isConnected)input.after(menu);
  const r=input.getBoundingClientRect(),below=innerHeight-r.bottom,above=r.top;
  const up=below<170&&above>below;
  menu.style.left=Math.max(4,r.left)+'px';menu.style.width=Math.min(Math.max(184,r.width),innerWidth-Math.max(4,r.left)-6)+'px';
  menu.style.top=up?'auto':(r.bottom+3)+'px';menu.style.bottom=up?(innerHeight-r.top+3)+'px':'auto';menu.style.maxHeight=Math.max(50,Math.min(214,(up?above:below)-8))+'px';
  menu.replaceChildren(...result.choices.map((row,i)=>{
   const item=document.createElement('div');item.role='option';item.id=`${menu.id}-${i}`;item.textContent=row.label;item.title=row.detail??row.text;item.onpointerdown=e=>e.preventDefault();item.onclick=()=>pick(i);return item;
  }));selected=-1;input.removeAttribute('aria-activedescendant');if(!menu.matches(':popover-open'))menu.showPopover();
 }
 input.addEventListener('input',e=>{if(!e.isComposing)show();});input.addEventListener('blur',close);
 input.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(e.code==='Space'&&(e.ctrlKey||e.metaKey)&&!e.altKey){e.preventDefault();e.stopPropagation();show(true);return;}
  if(tab&&e.key==='Tab'&&!e.shiftKey){if(!result)show(true);if(result?.choices.length){e.preventDefault();e.stopPropagation();pick(Math.max(0,selected));}return;}
  if(!result){if(e.key==='ArrowDown'&&e.altKey){e.preventDefault();show(true);}return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();selected=selected<0&&e.key==='ArrowUp'?result.choices.length-1:Math.max(0,Math.min(result.choices.length-1,selected+(e.key==='ArrowDown'?1:-1)));
   for(const [i,o] of [...menu.children].entries())o.setAttribute('aria-selected',String(i===selected));
   const o=menu.children[selected];input.setAttribute('aria-activedescendant',o.id);o.scrollIntoView({block:'nearest'});
  }else if(e.key==='Enter'&&selected>=0){e.preventDefault();pick(selected);}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
 });
 const api={show:()=>show(true),close};completions.set(input,api);return api;
}
