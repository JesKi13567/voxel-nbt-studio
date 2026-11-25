'use strict';
// Semantic SNBT values only: this does not interpret commands or function-like expressions.
function parse(text,utf,mixed=false,limit=256*1024,maxNodes=100000){
 if(typeof text!=='string'||text.length>limit)throw new Error(`SNBT 值为空或过大（最大 ${limit/1024} KiB 文本）`);
 let i=0,count=0;
 const b=v=>Buffer.from([v]);const num=(n,type)=>{
   const names=[null,'Int8','Int16BE','Int32BE','BigInt64BE','FloatBE','DoubleBE'],x=Buffer.alloc([0,1,2,4,8,4,8][type]);
   if(type!==4&&!Number.isFinite(n))err('不支持非有限数值');
   if(type===5&&!Number.isFinite(Math.fround(n)))err('Float 超出范围');
   try{x['write'+names[type]](n);}catch{err('数字超出标签类型的范围');}return x;
 };
 const err=m=>{throw new Error(`${m}（字符 ${i+1}）`);};
 const ws=()=>{while(/\s/.test(text[i]||'')&&i<text.length)i++;};
 const match=c=>{ws();if(text[i]===c){i++;return true;}return false;};
 const need=c=>{if(!match(c))err(`缺少 ${c}`);};
 function string(){
   const q=text[i++];let out='';
   for(;i<text.length;){const c=text[i++];if(c===q)return out;if(c!=='\\'){out+=c;continue;}
     const k=text[i++];if(k==='u'){const hex=text.slice(i,i+4);if(!/^[a-f0-9]{4}$/i.test(hex))err('无效的 Unicode 转义');out+=String.fromCharCode(parseInt(hex,16));i+=4;}
     else if(k==='n'||k==='r'||k==='t'||k==='f'||k==='b')out+=({n:'\n',r:'\r',t:'\t',f:'\f',b:'\b'})[k];
     else if(k==='\\'||k==='"'||k==="'"||k==='/')out+=k;else err('无效的字符串转义');
   }err('字符串没有闭合');
 }
 function token(){ws();const m=/^[A-Za-z0-9_.+\-]+/.exec(text.slice(i));if(!m)err('缺少值或键名（带冒号的字符串需要引号）');i+=m[0].length;return m[0];}
 const val=(type,data)=>({type,data}); const cat=parts=>Buffer.concat(parts);
 function list(depth){
   ws();let array=0, kind=0;
   if(/^[BILbil]\s*;/.test(text.slice(i))){array=({B:7,I:11,L:12})[text[i++].toUpperCase()];need(';');kind=({7:1,11:3,12:4})[array];}
   const values=[];
   while(!match(']')){
     const v=node(depth+1);if(!kind)kind=v.type;
     if(v.type!==kind){
      if(array)err('数组元素类型错误，B 用 b，L 用 L，I 用整数');
      if(!mixed)err('混合类型列表需要 Minecraft Java 1.21.5 或更高版本');
      kind=10;
     }
     values.push(v);if(match(']'))break;need(',');
   }
   const payload=values.map(v=>!array&&mixed&&kind===10&&(v.type!==10||v.wrapper)?cat([b(v.type),utf(''),v.data,b(0)]):v.data);
   return array?val(array,cat([num(values.length,3),...payload])):val(9,cat([b(kind),num(values.length,3),...payload]));
 }
 function node(depth){
   if(depth>64||++count>maxNodes)err('SNBT 嵌套或标签数量超限');
   if(match('{')){const vals=[],keys=new Set();while(!match('}')){ws();const k=text[i]==='"'||text[i]==="'"?string():token();if(keys.has(k))err('重复的字段名');keys.add(k);need(':');const v=node(depth+1);vals.push(b(v.type),utf(k),v.data);if(match('}'))break;need(',');}return {...val(10,cat([...vals,b(0)])),wrapper:keys.size===1&&keys.has('')};}
   if(match('['))return list(depth);
   ws();if(text[i]==='"'||text[i]==="'")return val(8,utf(string()));
   const t=token();if(t==='true'||t==='false')return val(1,b(t==='true'?1:0));
   const m=/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([bBsSlLfFdD]?)$/.exec(t);
   if(m){const integer=/^[+-]?\d+$/.test(m[1]);let type=({b:1,s:2,l:4,f:5,d:6})[m[2].toLowerCase()]||(integer?3:6);
    if(type<5&&!integer)err('整数标签不能包含小数');return val(type,num(type===4?BigInt(m[1]):Number(m[1]),type));}
   return val(8,utf(t));
 }
 const result=node(0);ws();if(i!==text.length)err('值后还有无法解析的文本');return result;
}
module.exports={parse};
