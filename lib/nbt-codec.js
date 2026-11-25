'use strict';

// Java binary NBT and byte-preserving edits. No structure or editor state.
const MAX_BYTES = 256 * 1024 * 1024;
const fixed = [0,1,2,4,8,4,8];
const numericReaders=[null,'readInt8','readInt16BE','readInt32BE','readBigInt64BE','readFloatBE','readDoubleBE'];
const fail = m => { throw new Error(m); };
// Java NBT uses modified UTF-8, including surrogate pairs and an encoded NUL.
function decode(b) {
  if (!b.includes(0xc0) && !b.some((v,i)=>v===0xed && b[i+1]>=0xa0)) return b.toString('utf8');
  let s=''; for(let i=0;i<b.length;) { const a=b[i++]; s+=String.fromCharCode(a<128?a:a<224?((a&31)<<6)|(b[i++]&63):((a&15)<<12)|((b[i++]&63)<<6)|(b[i++]&63)); }
  return s;
}
function utf(s) {
  const b=Buffer.allocUnsafe(s.length*3+2); let j=2;
  for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); if(c>0&&c<128)b[j++]=c; else if(c<2048){b[j++]=192|(c>>6);b[j++]=128|(c&63);}else{b[j++]=224|(c>>12);b[j++]=128|((c>>6)&63);b[j++]=128|(c&63);} }
  if(j-2>65535) fail('NBT 字符串过长'); b.writeUInt16BE(j-2,0);return b.subarray(0,j);
}
class Reader {
  constructor(buf,p=0){ this.b=buf; this.p=p; }
  need(n){ if(n<0||this.p+n>this.b.length)fail('NBT 文件截断或长度无效'); }
  byte(){this.need(1);return this.b[this.p++];}
  int(){this.need(4);const v=this.b.readInt32BE(this.p);this.p+=4;return v;}
  len(){const v=this.int(); if(v<0)fail('NBT 集合长度无效');return v;}
  str(){this.need(2);const n=this.b.readUInt16BE(this.p);this.p+=2;this.need(n);const p=this.p;this.p+=n;return decode(this.b.subarray(p,p+n));}
  blockKey(){
    this.need(2);const n=this.b.readUInt16BE(this.p);this.p+=2;const o=this.p;this.skip(n);const b=this.b;
    if(n===3){const k=b[o]*65536+b[o+1]*256+b[o+2];if(k===0x706f73)return 1;if(k===0x6e6274)return 3;}
    if(n===5&&b.readUInt32BE(o)===0x73746174&&b[o+4]===101)return 2;
    return 0;
  }
  skip(n){this.need(n);this.p+=n;}
  skipStr(){this.need(2);const n=this.b.readUInt16BE(this.p);this.skip(n+2);}
  skipTag(t,d=0){
    if(d>96)fail('NBT 嵌套过深');
    if(t>=1&&t<=6){this.skip(fixed[t]);return;}
    if(t===8){this.skipStr();return;}
    if(t===7||t===11||t===12){this.skip(this.len()*(t===7?1:t===11?4:8));return;}
    if(t===9){const k=this.byte(), n=this.len();if(k>12||(!k&&n))fail('NBT 列表类型无效');if(k>=1&&k<=6){this.skip(n*fixed[k]);return;}this.need(n);for(let i=0;i<n;i++)this.skipTag(k,d+1);return;}
    if(t===10){let k;while((k=this.byte())!==0){this.skipStr();this.skipTag(k,d+1);}return;}
    fail(`不支持的 NBT 标签 ${t}`);
  }
  fields(){const m=new Map();let type;while((type=this.byte())!==0){const start=this.p-1,name=this.str(),at=this.p;this.skipTag(type);if(m.has(name))fail('NBT 中存在重复字段');m.set(name,{type,start,at,end:this.p});}return m;}
  ints3(){const t=this.byte(),n=this.len();if(t!==3||n!==3)fail('结构坐标必须是三个整数');return [this.int(),this.int(),this.int()];}
  number(type){const offset=this.p;this.skip(fixed[type]);return this.b[numericReaders[type]](offset);}
  display(t,budget={n:1000},d=0){
    if(d>16||--budget.n<0){this.skipTag(t);return '…';}
    if(t===8)return this.str();
    if(t>=1&&t<=6){
      const value=this.number(t);
      return t===4?String(value)+'L':value;
    }
    if(t===10){const ob=Object.create(null);let k;while((k=this.byte())!==0){const key=this.str();if(budget.n>0)ob[key]=this.display(k,budget,d+1);else this.skipTag(k);}return ob;}
    if(t===9){const k=this.byte(),n=this.len(),out=[];for(let i=0;i<n;i++)if(budget.n>0)out.push(this.display(k,budget,d+1));else this.skipTag(k);if(out.length<n)out.push(`… ${n-out.length} 项`);return out;}
    if(t===7||t===11||t===12){const n=this.len();this.skip(n*(t===7?1:t===11?4:8));return `<数组：${n} 项>`;}
    fail('未知 NBT 数据类型');
  }
  snbt(t,depth=0,budget={n:0},listItem=false){
    if(depth>64||++budget.n>(budget.max??50000))fail('NBT 内容过大或嵌套过深，不适合在此预览');
    const group=(a,left,right)=>budget.pretty&&a.length?left+'\n'+'  '.repeat(depth+1)+a.join(',\n'+'  '.repeat(depth+1))+'\n'+'  '.repeat(depth)+right:left+a.join(',')+right;
    if(t===8)return JSON.stringify(this.str());
    if(t>=1&&t<=6){
      const value=this.number(t);
      if(budget.pretty&&t>=5&&!Number.isFinite(value))fail('此模板包含非有限浮点数，不能安全地编辑为全文 SNBT');
      return (Object.is(value,-0)?'-0':String(value))+['','b','s','','L','f','d'][t];
    }
    if(t===10){const a=[];let k;while((k=this.byte())!==0){const n=this.str();a.push([n,this.snbt(k,depth+1,budget)]);}
      return listItem&&a.length===1&&a[0][0]===''?a[0][1]:group(a.map(([key,value])=>JSON.stringify(key)+(budget.pretty?': ':':')+value),'{','}');}
    if(t===9){const k=this.byte(),n=this.len(),a=[];if(n>(budget.max??50000))fail('该列表过大，不适合在此预览');
      for(let i=0;i<n;i++)a.push(this.snbt(k,depth+1,budget,budget.mixed));return !budget.pretty||k>=1&&k<=6?`[${a.join(',')}]`:group(a,'[',']');}
    if(t===7||t===11||t===12){const n=this.len(),a=[],k=({7:1,11:3,12:4})[t];if(n>(budget.max??50000))fail('该数组过大，不适合在此预览');for(let i=0;i<n;i++)a.push(this.snbt(k,depth+1,budget));return '['+({7:'B',11:'I',12:'L'})[t]+';'+a.join(',')+']';}
    fail('未知 NBT 类型');
  }
}
const int=n=>{const b=Buffer.allocUnsafe(4);b.writeInt32BE(n);return b;};
const flag=n=>Buffer.from([n]);
function named(t,name,payload){return Buffer.concat([flag(t),utf(name),payload]);}
function listHeader(t,n){return Buffer.concat([flag(t),int(n)]);}
function posBytes(xyz){return Buffer.concat([listHeader(3,3),...xyz.map(int)]);}

function numbers(data,field,kind,count){
  if(field?.type!==9)return null;
  const r=new Reader(data,field.at);if(r.byte()!==kind||r.len()!==count)return null;
  const step=fixed[kind],read=kind===6?'readDoubleBE':kind===5?'readFloatBE':'readInt32BE';
  return Array.from({length:count},(_,i)=>data[read](r.p+i*step));
}
function numericList(values,kind){
  const b=Buffer.alloc(values.length*fixed[kind]),write=kind===6?'writeDoubleBE':kind===5?'writeFloatBE':'writeInt32BE';
  values.forEach((n,i)=>b[write](n,i*fixed[kind]));return {type:9,data:Buffer.concat([listHeader(kind,values.length),b])};
}

function nbtMatches(type,expected,actual,spend){
  spend(1);if(expected.equals(actual))return true;
  if(type===10){
    const fields=new Reader(actual).fields();spend(fields.size);
    for(const [key,want] of new Reader(expected).fields()){
      const got=fields.get(key);if(got?.type!==want.type||!nbtMatches(want.type,expected.subarray(want.at,want.end),actual.subarray(got.at,got.end),spend))return false;
    }
    return true;
  }
  if(type!==9)return false;
  function entries(bytes){
    const r=new Reader(bytes),kind=r.byte(),size=r.len();spend(size);const values=[];
    for(let i=0;i<size;i++){const start=r.p;r.skipTag(kind);let row=[kind,bytes.subarray(start,r.p)];
      if(kind===10){const f=new Reader(row[1]).fields();if(f.size===1&&f.has('')){const e=f.get('');row=[e.type,row[1].subarray(e.at,e.end)];}}
      values.push(row);
    }
    return values;
  }
  const a=entries(expected),b=entries(actual);
  return a.length?a.every(([k,v])=>b.some(([t,w])=>{spend(1);return k===t&&nbtMatches(k,v,w,spend);})):b.length===0;
}

function updated(b,writes){
  const all=[];let offset=0;for(const w of writes.sort((a,b)=>a.at-b.at)){if(w.at<offset)fail('NBT 更新范围重叠');all.push(b.subarray(offset,w.at));for(const p of w.payload)all.push(p);offset=w.end;}
  all.push(b.subarray(offset));const n=all.reduce((n,p)=>n+p.length,0);if(n>MAX_BYTES)fail('编辑后的 NBT 超过 256 MiB');return Buffer.concat(all,n);
}
function editCompound(bytes,path,value){
  const [key,...rest]=path;const r=new Reader(bytes),f=r.fields(),cur=f.get(key);let payload;
  if(rest.length){if(cur&&cur.type!==10)fail('中间字段不是 compound，不能直接添加子字段');payload=[named(10,key,editCompound(cur?bytes.subarray(cur.at,cur.end):flag(0),rest,value))];}
  else payload=value?[named(value.type,key,value.data)]:[];
  return updated(bytes,[{at:cur?.start??(r.p-1),end:cur?.end??(r.p-1),payload}]);
}
function compoundFieldAt(bytes,path){
  if(!bytes)return null;let field;
  for(const k of path){field=new Reader(bytes).fields().get(k);if(!field)return null;bytes=bytes.subarray(field.at,field.end);}
  return {type:field.type,bytes};
}

module.exports={Reader,utf,int,flag,named,listHeader,posBytes,fail,MAX_BYTES,numbers,numericList,nbtMatches,updated,editCompound,compoundFieldAt};
