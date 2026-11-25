import {createBlockPicker} from './block-picker.js';
import {compileMask,predicateFields,directions} from './mask.js';
const $=id=>document.getElementById(id);
const names={true:'始终通过',matching_blocks:'匹配方块 ID / 标签',matching_block_tag:'匹配方块标签',matching_fluids:'匹配流体',solid:'实心',replaceable:'可替换',has_sturdy_face:'具有支撑面',height_range:'模板内 Y 高度范围',volume_match:'区域内全部匹配',all_of:'全部满足',any_of:'任一满足',not:'取反'};
const anchorTypes=['absolute','above_bottom','below_top'];
const vectorKeys=new Set(['offset','min','max']);
const maskTool=mode=>mode==='place'?'paint':mode==='box'?'fill':mode;
function make(type){
 const o={type:'minecraft:'+type};
 for(const k of predicateFields[type]){
  if(vectorKeys.has(k))o[k]=[0,0,0];
  else if(k==='blocks')o[k]='minecraft:stone';else if(k==='tag')o[k]='minecraft:logs';else if(k==='fluids')o[k]='#minecraft:water';
  else if(k==='direction')o[k]='up';else if(k==='min_inclusive')o[k]={above_bottom:0};else if(k==='max_inclusive')o[k]={below_top:0};
  else if(k==='predicates')o[k]=[make('true')];else o[k]=make('true');
 }
 return o;
}
function migratePreset(node){
 if(!node||typeof node.type!=='string')return node;
 const type=node.type.replace(/^minecraft:/,''),next={...node};
 if(type==='matching_block_tag'&&typeof next.tag==='string')next.tag=next.tag.replace(/^#/,'');
 for(const k of ['predicate','match'])if(next[k])next[k]=migratePreset(next[k]);
 if(Array.isArray(next.predicates))next.predicates=next.predicates.map(migratePreset);
 const key=type==='matching_blocks'?'blocks':type==='matching_fluids'?'fluids':null;
 if(key&&Array.isArray(next[key])){
  const tags=next[key].filter(k=>typeof k==='string'&&k.startsWith('#'));
  if(tags.length){const ids=next[key].filter(k=>!tags.includes(k)),terms=tags.map(k=>({...next,[key]:k}));
   if(ids.length)terms.push({...next,[key]:ids});return terms.length===1?terms[0]:{type:'minecraft:any_of',predicates:terms};}
 }
 return next;
}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function button(text,fn){const b=el('button','',text);b.type='button';b.onclick=fn;return b;}
function choice(values,value,fn){const select=el('select');for(const [k,name] of values){const o=el('option','',name);o.value=k;select.append(o);}select.value=value;select.onchange=()=>fn(select.value);return select;}
function input(value,type,label,change){const e=el('input');e.type=type;e.value=value??'';e.setAttribute('aria-label',label);e.oninput=()=>change(type==='number'?(e.value===''?null:e.valueAsNumber):e.value);return e;}
function field(label,...controls){const row=el('div','mask-field');row.append(el('span','muted',label),...controls);return row;}
export function createMaskEditor(vscode,blocks){
 const saved=vscode.getState?.()||{},states={};
 for(const mode of ['paint','fill'])states[mode]={spec:migratePreset(saved.maskTools?.[mode]?.spec??saved.maskSpec??make('matching_blocks')),enabled:Boolean(saved.maskTools?.[mode]?.enabled??saved.maskEnabled)};
 let tool=null,height=null,catalog=null,jarChosen=false,error='',draft=null,pickers=[];
 const panel=$('maskPanel'),options=$('maskOptions'),summary=$('maskStatus');
 const state=()=>states[tool];
 function save(){const saved={...vscode.getState?.(),maskTools:states};delete saved.maskSpec;delete saved.maskEnabled;vscode.setState?.(saved);}
 function close(){draft=null;pickers=[];options.hidden=true;$('maskOpen').setAttribute('aria-expanded','false');$('maskOpen').textContent='编辑谓词…';}
 function forTool(mode){const slot=maskTool(mode),next=Object.hasOwn(states,slot)?slot:null;if(next===tool)return;close();tool=next;panel.hidden=!tool;if(tool)$(tool==='paint'?'paintMask':'fillMask').append(panel);sync();}
 function templateHeight(y){height=y;if(!options.hidden)display();}
 function prefs(isJar){jarChosen=isJar;if(!isJar){catalog=null;error='';close();}sync();}
 function supply(data,message){catalog=data;error=message||'';if(!catalog)close();sync();}
 function sync(){
  $('maskOpen').disabled=!catalog;$('maskEnabled').disabled=!catalog;$('maskEnabled').checked=Boolean(state()?.enabled&&catalog);
  $('sharedMaskHint').hidden=tool!=='paint';
  const type=state()?.spec.type?.replace(/^minecraft:/,'');summary.textContent=!jarChosen?'请先在「设置 → 原版资源」选择客户端 JAR。':!catalog?(error||'正在读取 JAR 标签并准备方块状态…'):(state()?.enabled?'已启用 · '+(names[type]||type):'未启用 · 不限制目标方块');
 }
 function active(mode){
  const current=states[maskTool(mode)];if(!jarChosen||!current?.enabled)return null;
  if(!catalog&&error)throw new Error(error);
  return {spec:current.spec,rule:compileMask(current.spec,catalog)};
 }
 function json(){ $('maskJson').value=JSON.stringify(draft,null,2);$('maskError').textContent=''; }
 function display(){
  pickers=[];
  const ids=catalog.traits?Object.keys(catalog.traits):blocks.ids(),set=new Set(ids);
  const idsWithTags=ids.concat(Object.keys(catalog.tags?.block??{}).sort().map(id=>'#'+id));
  function render(node,replace,depth){
   const type=node.type.replace(/^minecraft:/,''),section=el('div','predicate-node');
   const options=Object.keys(predicateFields).filter(k=>catalog.traits||!['solid','replaceable','has_sturdy_face','matching_fluids'].includes(k)||k===type);
   const choose=choice(options.map(k=>[k,names[k]+' · '+k]),type,v=>replace(make(v)));choose.setAttribute('aria-label','谓词类型');section.append(choose);
   if(type==='solid')section.append(el('small','muted','采用原版 isSolid；不等同于完整方块或具有支撑面。'));
   if(type==='height_range')section.append(el('small','mask-y-range',height?`模板内部 Y：0–${height-1}（底层为 0）`:'Y 使用模板内部坐标，底层为 0'));
   for(const k of predicateFields[type]){
    if(vectorKeys.has(k)){
     const vals=node[k]||[0,0,0],v=el('div','mask-vector');
     for(const [i,a] of ['X','Y','Z'].entries()){const f=input(vals[i],'number',k+' '+a,n=>{vals[i]=n;node[k]=vals;json();});f.min=-16;f.max=16;v.append(f);}
     section.append(field(k,v));
    }else if(k==='direction'){
     const e=choice(directions.map(d=>[d,d]),node[k],v=>{node[k]=v;json();});e.setAttribute('aria-label','支撑方向');section.append(field(k,e));
    }else if(k==='tag'){
     const f=input(node.tag,'text','方块标签',v=>{node.tag=v.trim();json();});f.setAttribute('list','maskDirectTags');section.append(field('tag',f));
    }else if(k==='blocks'||k==='fluids'){
     const vals=Array.isArray(node[k])?[...node[k]]:[node[k]],update=()=>{node[k]=vals.length===1?vals[0]:vals;json();};
     const list=el('div','mask-list');list.append(el('span','muted',k+' · 标签须单独填写，多项列表只填 ID'));
     vals.forEach((v,i)=>{
      const change=value=>{vals[i]=value.trim();update();},row=el('div','row');
      if(k==='blocks'){
       const f=el('input');f.type='text';f.value=v??'';f.setAttribute('aria-label',k+' '+(i+1));
       const picker=createBlockPicker(f,{choices:()=>vals.length===1?idsWithTags:ids,preview:blocks.preview,known:id=>set.has(id),allowTags:vals.length===1,onInput:change});
       pickers.push(picker);row.append(picker.root);
      }else{const f=input(v,'text',k+' '+(i+1),change);f.setAttribute('list','maskFluidTags');row.append(f);}
      if(vals.length>1)row.append(button('移除',()=>{vals.splice(i,1);update();display();}));list.append(row);
     });
     list.append(button('＋ 添加一项',()=>{if(vals.length>=256||vals.some(v=>v?.startsWith('#'))){$('maskError').textContent='标签必须单独填写；多个标签可用任一满足组合。';return;}vals.push(k==='blocks'?'minecraft:stone':'minecraft:water');update();display();}));section.append(list);
    }else if(k==='min_inclusive'||k==='max_inclusive'){
     const a=Object.keys(node[k])[0],n=node[k][a];
     const sel=choice(anchorTypes.map(v=>[v,({absolute:'本地 Y',above_bottom:'距模板底部',below_top:'距模板顶部'})[v]]),a,v=>{node[k]={[v]:n};json();display();});sel.setAttribute('aria-label',k+' 锚点');
     const num=input(n,'number',k+' Y',v=>{node[k]={[a]:v};json();});section.append(field(k,sel,num));
    }else if(k==='predicates'){
     const list=el('div','mask-children');node[k].forEach((sub,i)=>{const row=el('div');row.append(render(sub,next=>{node[k][i]=next;display();},depth+1));
      if(node[k].length>1)row.append(button('移除此子谓词',()=>{node[k].splice(i,1);display();}));list.append(row);});
     if(depth<11&&node[k].length<128)list.append(button('＋ 添加子谓词',()=>{node[k].push(make('true'));display();}));section.append(list);
    }else{
     const wrap=el('div','mask-children');wrap.append(el('span','muted',k),render(node[k],next=>{node[k]=next;display();},depth+1));section.append(wrap);
    }
   }
   return section;
  }
  $('maskTree').replaceChildren(render(draft,next=>{draft=next;display();},0));json();
 }
 function open(){
  if(!catalog||!state())return;if(!options.hidden){close();return;}
  draft=structuredClone(state().spec);
  try{compileMask(draft,catalog);}catch{draft=make('matching_blocks');}
  $('maskSource').textContent=`标签来源：Minecraft ${catalog.version} JAR · 坐标使用模板本地坐标`;
  for(const [key,kind,tag] of [['maskFluidTags','fluid',true],['maskDirectTags','block',false]]){
   const options=Object.keys(catalog.tags[kind]||{}).sort().map(k=>{const o=el('option');o.value=(tag?'#':'')+k;return o;});$(key).replaceChildren(...options);
  }
  display();options.hidden=false;$('maskOpen').setAttribute('aria-expanded','true');$('maskOpen').textContent='收起谓词';
 }
 $('maskEnabled').onchange=()=>{if(!state())return;state().enabled=$('maskEnabled').checked;save();sync();};
 $('maskOpen').onclick=open;$('maskCancel').onclick=close;
 $('maskImport').onclick=()=>{try{const raw=$('maskJson').value;if(raw.length>65536)throw new Error('谓词 JSON 过长');const imported=JSON.parse(raw);compileMask(imported,catalog);draft=imported;display();}catch(e){$('maskError').textContent=e.message;}};
 $('maskSave').onclick=()=>{try{compileMask(draft,catalog);state().spec=structuredClone(draft);state().enabled=true;save();sync();close();}catch(e){$('maskError').textContent=e.message;}};
 sync();return {active,prefs,supply,forTool,templateHeight,blockTags:()=>Object.keys(catalog?.tags?.block??{}).map(id=>'#'+id),refreshPreviews(){for(const p of pickers)p.refresh();}};
}
