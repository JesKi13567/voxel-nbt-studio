const make=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
let listId=0;
export function blockId(raw){
 const text=String(raw??'').trim(),id=text.includes(':')?text:'minecraft:'+text;
 return /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)&&id.length<=160&&!id.split(/[:/]/).some(part=>!part||part==='.'||part==='..')?id:null;
}
export function createBlockPicker(input,{choices,preview,value,onInput,allowTags=false,known=()=>true}){
 const root=make('div','block-picker'),entry=make('div','block-entry'),current=make('div','block-current'),toggle=make('button','block-dropdown','⌄'),menu=make('div','block-menu');
 menu.id='block-options-'+(++listId);menu.setAttribute('role','listbox');menu.hidden=true;current.setAttribute('aria-hidden','true');
 toggle.type='button';toggle.setAttribute('aria-label','展开方块列表');toggle.title='展开方块列表';
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-controls',menu.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';input.spellcheck=false;
 entry.append(current,input,toggle);root.append(entry,menu);
 let matches=[],index=-1,query='';
 function renderPreview(parent,raw,state){
  const image=make('span','block-image');image.setAttribute('aria-hidden','true');parent.replaceChildren(image);
  if(raw?.startsWith('#')){image.classList.add('tag-image');image.textContent='#';image.title='方块标签';return;}
  const id=blockId(raw);
  if(!id||!known(id)){image.classList.add('empty-image');image.textContent='—';return;}
  image.title=id;preview(image,state?.name===id?state:{name:id,props:{}});
 }
 function refreshCurrent(){renderPreview(current,input.value.trim(),value?.());}
 function close(){menu.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');index=-1;}
 function highlight(next){
  index=matches.length?Math.min(matches.length-1,Math.max(-1,next)):-1;
  for(let i=0;i<matches.length;i++)menu.children[i].setAttribute('aria-selected',String(index===i));
  if(index<0)input.removeAttribute('aria-activedescendant');
  else{const row=menu.children[index];input.setAttribute('aria-activedescendant',row.id);row.scrollIntoView({block:'nearest'});}
 }
 function select(id){input.value=id;onInput(id);refreshCurrent();close();input.focus();}
 function show(term){
  query=term;const q=term.trim().toLowerCase(),needle=q.replace(/^#/,'').replace(/^minecraft:/,'');
  const ranks=[[],[],[]];for(const id of choices()){
   const tag=id.startsWith('#');if(tag?(!allowTags||!q):q.startsWith('#'))continue;
   const path=id.replace(/^#?[^:]+:/,'');const exact=id===q||path===needle,starts=path.startsWith(needle)||id.startsWith(q);
   if(exact)ranks[0].push(id);else if(starts)ranks[1].push(id);else if(path.includes(needle)||id.includes(q))ranks[2].push(id);
  }
  matches=[...new Set(ranks.flat())].slice(0,14);menu.replaceChildren();
  for(const [i,id] of matches.entries()){
   const row=make('div','block-option'),icon=make('span','block-option-icon'),text=make('span','block-option-name',id);row.id=menu.id+'-'+i;row.setAttribute('role','option');row.setAttribute('aria-selected','false');
   renderPreview(icon,id);row.append(icon,text);row.onpointerdown=e=>e.preventDefault();row.onclick=()=>select(id);menu.append(row);
  }
  if(!matches.length)menu.append(make('small','block-no-results','没有匹配的方块 ID'));
  const area=root.closest('.sidebar-body')?.getBoundingClientRect(),rect=entry.getBoundingClientRect();
  const below=(area?.bottom??window.innerHeight)-rect.bottom,above=rect.top-(area?.top??0),up=below<140&&above>below;
  menu.classList.toggle('above',up);menu.style.maxHeight=Math.max(48,Math.min(190,(up?above:below)-5))+'px';
  index=-1;input.removeAttribute('aria-activedescendant');input.setAttribute('aria-expanded','true');menu.hidden=false;
 }
 input.addEventListener('input',()=>{onInput(input.value);refreshCurrent();show(input.value);});
 input.addEventListener('blur',close);
 input.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();if(menu.hidden)show('');highlight(index<0&&e.key==='ArrowUp'?matches.length-1:index+(e.key==='ArrowDown'?1:-1));
  }else if(e.key==='Enter'&&!menu.hidden&&index>=0){e.preventDefault();select(matches[index]);}
  else if((e.key==='Escape'||e.key==='Enter')&&!menu.hidden){e.preventDefault();close();}
 });
 toggle.onpointerdown=e=>e.preventDefault();toggle.onclick=()=>{input.focus();if(menu.hidden)show('');else close();};
 const refresh=()=>{refreshCurrent();if(!menu.hidden)show(query);};
 refresh();return {root,refresh};
}
