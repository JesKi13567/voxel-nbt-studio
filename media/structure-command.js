import {blockId} from './block-picker.js';
import {bindCompletion,completionAt} from './nbt-completion.js';

const commands=['setblock','fill','summon'];
const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const integer=/^[+-]?\d+$/;
const filteredModes=['outline','hollow','destroy','strict'];
const setblockModes=['destroy','strict','replace','keep'],fillModes=[...filteredModes,'replace','keep'];
const syntax={setblock:'/setblock <坐标> <方块>[状态]{SNBT} [destroy|strict|replace|keep]',fill:'/fill <第一角> <第二角> <方块> [outline|hollow|destroy|strict|replace|keep] · replace <筛选> [outline|hollow|destroy|strict]',summon:'/summon <实体> <坐标> [SNBT]'};
function words(text){
 const out=[];
 for(let i=0;i<text.length;){
  if(/\s/.test(text[i])){i++;continue;}
  const start=i;let quote='',depth=0;
  for(;i<text.length;i++){
   const c=text[i];if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}
   if(c==='"'||c==="'")quote=c;
   else if(c==='{'||c==='[')depth++;
   else if(c==='}'||c===']')depth--;
   else if(/\s/.test(c)&&depth<=0)break;
  }
  out.push({text:text.slice(start,i),start,end:Math.min(i,text.length)});
 }
 return out;
}
function xyz(tokens,eye,entity){
 if(tokens.length!==3)throw new Error('坐标需要 X、Y、Z 三项。');
 return tokens.map((t,i)=>{
  const relative=t.startsWith('~'),s=relative?t.slice(1):t;
  if(!(relative&&!s)&&(relative||entity?!numeric.test(s):!integer.test(s)))throw new Error('无效坐标：'+t+'。可使用数字或 ~。');
  const n=Number(s)+(relative?eye[i]:entity&&i!==1&&integer.test(s)?.5:0);
  if(!Number.isFinite(n)||Math.abs(n)>30_000_000)throw new Error('坐标超出范围。');
  return entity?n:Math.floor(n);
 });
}
function block(token,filter=false){
 const match=/^(#?)([^\s\[\]{}]+)(?:\[([^\]]*)\])?(\{[\s\S]*\})?$/.exec(token??''),name=blockId(match?.[2]),tag=match?.[1]==='#';
 if(!name||tag&&!filter)throw new Error(filter?'请输入方块 ID 或 #标签作为筛选条件。':'请输入方块 ID，例如 minecraft:oak_log[axis=y]，方块实体数据紧跟在 {} 中。');
 const entries=new Map();
 if(match[3]?.trim())for(const t of match[3].split(',')){
  const m=/^\s*([a-z0-9_]+)\s*=\s*([a-zA-Z0-9_.:/+-]+)\s*$/.exec(t);
  if(!m||entries.has(m[1]))throw new Error('无效或重复的方块状态：'+t);
  entries.set(m[1],m[2]);
 }
 return {name,props:Object.fromEntries(entries),...(tag?{tag}:{}),...(match[4]?{snbt:match[4]}:{})};
}
export function parseStructureCommand(text,eye){
 const args=words(text).map(t=>t.text),cmd=args[0]?.replace(/^\//,'');
 if(!commands.includes(cmd))throw new Error('仅支持 /setblock、/fill 和 /summon。');
 if(cmd==='summon'){
  const id=blockId(args[1]);if(!id)throw new Error('请输入有效的实体 ID。');
  const pos=xyz(args.slice(2,5),eye,true),snbt=args[5];
  if(args.length>6||snbt&&(!snbt.startsWith('{')||!snbt.endsWith('}')))throw new Error('实体 NBT 请填写完整的 {…}。');
  return {cmd,id,pos,snbt};
 }
 const fill=cmd==='fill',at=fill?7:4,a=xyz(args.slice(1,4),eye,false),b=fill?xyz(args.slice(4,7),eye,false):a;
 const {snbt,...state}=block(args[at]);let mode=args[at+1]??'replace',blockFilter;
 if(!(fill?fillModes:setblockModes).includes(mode))throw new Error('不支持的放置模式：'+mode);
 if(fill&&mode==='replace'&&args.length>at+2){
  blockFilter=block(args[at+2],true);mode=args[at+3]??'replace';
  if(args.length>at+4||args[at+3]&&!filteredModes.includes(mode))throw new Error('带筛选条件的 replace 后只可使用 outline、hollow、destroy 或 strict。');
 }else if(args.length>at+2)throw new Error('放置模式后有多余参数。');
 return {cmd,box:[a,b],state,mode,...(snbt?{snbt}:{}),...(blockFilter?{blockFilter}:{})};
}

export function commandCompletions(text,caret,context){
 const args=words(text),found=args.findIndex(t=>caret>=t.start&&caret<=t.end),slot=found>=0?found:args.filter(t=>t.end<caret).length;
 const cur=found<0?{start:caret,end:caret,text:''}:args[slot],q=text.slice(cur.start,caret),cmd=args[0]?.text.replace(/^\//,'');
 const tail=cur.end<text.length&&/\s/.test(text[cur.end])?'':' ';
 const entry=(text,label=text)=>({label,text:text+tail});
 const result=(choices,start=cur.start,end=cur.end)=>({start,end,choices});
 const filter=(list,prefix)=>list.filter(x=>x.startsWith(prefix)||x.replace(/^(#?)minecraft:/,'$1').startsWith(prefix)).slice(0,32);
 if(!slot)return result(filter(commands,q.replace(/^\//,'')).map(v=>entry('/'+v)));
 if(!commands.includes(cmd))return null;
 if(cmd==='summon'&&slot===1)return result(filter(context.entityIds,q).map(v=>entry(v)));
 const first=cmd==='summon'?2:1,last=cmd==='fill'?6:first+2;
 if(slot>=first&&slot<=last){
  const second=cmd==='fill'&&slot>=4,startSlot=second?4:first;
  const a=Math.min(cur.start,args[startSlot]?.start??cur.start);
  const b=Math.max(cur.end,args[startSlot+2]?.end??cur.end);
  const coords=(textValue,label)=>({label,text:textValue+(b<text.length&&/\s/.test(text[b])?'':' ')});
  const choices=[],region=context.region,point=cmd==='fill'&&region?(second?region.hi:region.lo):context.point;
  if(cmd==='fill'&&region&&!second&&slot===first&&args.length<5&&!q.startsWith('~'))choices.push(coords(`${region.lo.join(' ')} ${region.hi.join(' ')}`,'使用选区两角'));
  if(point&&!q.startsWith('~')){
   const p=cmd==='summon'?[point[0]+.5,point[1]+(context.pointAbove?1:0),point[2]+.5]:point;
   choices.push(coords(p.join(' '),`使用${cmd==='fill'&&region?(second?'选区第二角':'选区第一角'):'当前方块'} · ${p.join(' ')}`));
  }
  if(q.startsWith('~'))choices.push(coords('~ ~ ~','相对于摄像头 · ~ ~ ~'));
  choices.push({label:'到画布取坐标…',action:span=>context.pick(span,cmd,cmd==='fill'?(second?2:1):null)});
  return result(choices,a,b);
 }
 if(cmd==='summon'){
  if(slot!==5)return null;
  if(!cur.text)return result([{label:'{…} 实体 NBT',text:'{}',caret:1}]);
  const id=blockId(args[1]?.text),ctx=context.schema;
  if(!id||!ctx||!cur.text.startsWith('{'))return null;
  const hit=completionAt(cur.text,caret-cur.start,{ctx,root:'entity',id,forbid:['id','Pos','UUID']});
  return hit&&result(hit.choices,cur.start+hit.start,cur.start+hit.end);
 }
 const statePos=cmd==='fill'?7:4;
 const filterSlot=cmd==='fill'&&args[statePos+1]?.text==='replace';
 if(slot===statePos||filterSlot&&slot===statePos+2){
  const filtering=slot!==statePos,brace=q.indexOf('{'),square=q.indexOf('[');
  const id=blockId(q.split(/[\[{]/,1)[0]),tile=context.tileTypes?.[id];
  if(brace>=0){
   if(!context.schema)return null;
   const hit=completionAt(cur.text.slice(brace),caret-cur.start-brace,{ctx:context.schema,root:'blockEntity',id:tile,forbid:filtering?[]:['id','x','y','z']});
   return hit&&result(hit.choices,cur.start+brace+hit.start,cur.start+brace+hit.end);
  }
  const nbt=()=>({label:'{…} 方块实体 NBT',text:q+'{}',caret:q.length+1});
  if(square<0){
   const list=filtering?[...context.blockIds,...(context.blockTags??[])]:context.blockIds;
   const picks=filter(list,q),choices=picks.map(v=>entry(v));
   if(picks.includes(id)&&tile)choices.unshift(nbt());
   if(picks.includes(id)&&Object.keys(context.states[id]??{}).length)
    choices.unshift({label:`${id}[…] · 方块状态`,text:id+'[]',caret:id.length+1});
   return result(choices);
  }
  if(q.endsWith(']'))return tile&&!cur.text.includes('{')?result([nbt()]):null;
  const props=context.states[id]??{},comma=q.lastIndexOf(','),start=Math.max(square,comma)+1;
  const part=q.slice(start),eq=part.indexOf('='),end=cur.start+(cur.text.slice(start).search(/[,\]]/)<0?cur.text.length:start+cur.text.slice(start).search(/[,\]]/));
  if(eq>=0){const k=part.slice(0,eq).trim();return result(filter(props[k]?.values??[],part.slice(eq+1).trim()).map(v=>({label:v,text:v})),cur.start+start+eq+1,end);}
  const used=new Set(q.slice(square+1,start).split(',').map(v=>v.split('=')[0].trim()));
  return result(filter(Object.keys(props).filter(v=>!used.has(v)),part.trim()).map(v=>({label:v,text:v+'='})),cur.start+start,end);
 }
 if(slot===statePos+1||filterSlot&&slot===statePos+3)return result(filter(slot===statePos+3?filteredModes:cmd==='fill'?fillModes:setblockModes,q).map(v=>entry(v)));
 return null;
}

export function createStructureCommands({context,execute,notify,prewarm,onPickingChange}){
 const input=document.getElementById('structureCommand'),take=document.getElementById('commandPick'),help=document.getElementById('commandHelp');
 let picking=null,warmed=false;
 const completion=bindCompletion(input,()=>commandCompletions(input.value,input.selectionStart,{...context(),pick:startPick}),{tab:true,label:'指令补全'});
 function status(){
  const cmd=words(input.value)[0]?.text.replace(/^\//,'');
  help.textContent=picking?`点击画布${picking.corner===1?'选第一角（1/2）':picking.corner===2?'选第二角（2/2）':'取坐标'} · Alt 面外一格 · Esc 取消`:document.activeElement===input?(syntax[cmd]??'Tab 补全 · Enter 执行 · /setblock、/fill、/summon'):'';
  take.setAttribute('aria-pressed',String(!!picking));
 }
 function startPick({start,end},cmd,corner){completion.close();picking={start,end,cmd,corner,text:input.value};status();onPickingChange(true);}
 function offerPick(){
  const get=commandCompletions(input.value,input.selectionStart,{...context(),pick:startPick});
  const action=get?.choices.find(choice=>choice.action)?.action;
  if(action)action(get);else notify('请先把光标放在指令的坐标部分。',true);
 }
 function cancel(){
  if(!picking)return false;
  const {start,text}=picking;picking=null;
  if(input.value===text)input.setSelectionRange(start,start);
  status();onPickingChange(false);return true;
 }
 take.onpointerdown=e=>e.preventDefault();take.onclick=()=>{
  const caret=input.selectionStart;input.focus();input.setSelectionRange(caret,caret);
  if(!cancel())offerPick();
 };
 function warm(){const summon=/^\s*\/?summon\s/.test(input.value);if(summon&&!warmed)prewarm();warmed=summon;}
 input.onfocus=()=>{warmed=false;status();warm();};
 input.oninput=()=>{cancel();status();warm();};
 input.onblur=status;
 input.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing)return;
  if(e.key==='Escape'){if(!cancel())input.blur();return;}
  if(e.key==='Enter'){e.preventDefault();if(picking)return;
   try{execute(parseStructureCommand(input.value,context().eye),input.value);completion.close();}catch(err){notify(err.message,true);}
  }
 });
 return {focus(){input.focus();if(!input.value){input.value='/';input.setSelectionRange(1,1);}status();completion.show();},
  complete(text){if(input.value===text){input.value='';completion.close();status();warm();}},
  cancel,picking:()=>picking?.cmd??null,update(locked,hidden){input.disabled=take.disabled=locked;input.closest('.command-dock').hidden=hidden;if(locked||hidden)cancel();},
  plot(pos){if(!picking)return;const {text,start,end,cmd,corner}=picking;cancel();input.focus();if(input.value!==text)return;
   const value=(cmd==='summon'?[pos[0]+.5,pos[1],pos[2]+.5]:pos).join(' ');
   input.setRangeText(value+(text[end]&&/\s/.test(text[end])?'':' '),start,end,'end');
   if(corner===1){const caret=words(input.value)[4]?.start??input.value.length;input.setSelectionRange(caret,caret);offerPick();}
   else status();}
 };
}
