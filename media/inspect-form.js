const $=id=>document.getElementById(id);
const option=(value,label=value)=>{const el=document.createElement('option');el.value=value;el.textContent=label;return el;};
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function icon(label,click,restore=false){const b=el('button',restore?'inspect-icon restore':'inspect-icon remove',restore?'↶':'−');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=e=>{e.preventDefault();e.stopPropagation();click();};return b;}
export function renderStateRows(host,values,specs,{prefix,draft,change}){
 host.replaceChildren();if(!values)return;
 const keys=Object.keys(specs).sort();if(!keys.length)host.append(el('small','','这个方块没有可编辑的状态属性。'));
 for(const key of keys){
  const spec=specs[key],base=values[key]??null,value=draft?.has(key)?draft.get(key):base;
  const row=el('div','inspect-field'),label=el('label','inspect-label',key),choose=el('select','inspect-value');
  choose.id=prefix+key;label.htmlFor=choose.id;
  choose.append(option('',spec.default===undefined?'— 未设置 —':`— 未设置（默认 ${spec.default}）—`));
  for(const v of new Set([...spec.values,...(base===null?[]:[base])]))choose.append(option(v));choose.value=value??'';
  const set=v=>{change(key,v);choose.value=v??'';row.dataset.changed=String(Boolean(draft?.has(key)));remove.disabled=v===null;};
  const remove=icon('移除属性 '+key,()=>set(null));remove.disabled=value===null;choose.onchange=()=>set(choose.value||null);
  row.dataset.changed=String(Boolean(draft?.has(key)));row.append(label,choose,remove);host.append(row);
 }
}
export function createStateInspector({blocked,writeState}){
 let current=null,props={};const draft=new Map();
 function buttons(){
  const no=blocked();$('stateApply').disabled=$('stateReset').disabled=no||!draft.size;$('stateForm').inert=no;
 }
 function render(){
  renderStateRows($('stateForm'),current?.props,props,{prefix:'state_',draft,change(key,value){
   if(value===(current.props[key]??null))draft.delete(key);else draft.set(key,value);buttons();
  }});buttons();
 }
 function state(st,spec,reset=false){
  if(!reset&&st===current)return;
  current=st;props=spec??{};draft.clear();render();
 }
 function submitted(){draft.clear();render();}
 $('stateApply').onclick=()=>{if(!blocked()&&draft.size)writeState([...draft].map(([key,value])=>({key,value})));};
 $('stateReset').onclick=submitted;
 return {state,buttons,submitted};
}
