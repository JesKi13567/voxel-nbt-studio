'use strict';
// Build the offline Java NBT catalog from Spyglass symbols and Misode's versioned summaries.
const fs=require('node:fs'),path=require('node:path');
const [symbolsPath,registriesPath,versionsPath]=process.argv.slice(2);
if(!versionsPath)throw new Error('Usage: node scripts/build-nbt-catalog.cjs symbols.json registries.json versions.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const symbols=read(symbolsPath),registry=read(registriesPath),versions=read(versionsPath);
const latest='26.3',java=versions.find(v=>v.id===latest);
if(!java||!symbols.mcdoc||!registry.attribute||!registry.mob_effect)throw new Error('Unexpected upstream catalog');
const version=versions.filter(v=>v.data_version>0&&(v.type==='release'||v.release_target)).map(v=>[v.data_version,v.type==='release'?v.id:v.release_target]).sort((a,b)=>a[0]-b[0]);
// Start from structure records, then retain only transitively reachable Java NBT types.
const types={},dispatch={},registries={};
const attrValue=v=>v?.kind==='literal'?v.value.value:v?.kind==='tree'?Object.fromEntries(Object.entries(v.values).map(([k,n])=>[k,attrValue(n)])):null;
function registryNames(id){const key=id?.replace(/^minecraft:/,'');if(key&&registry[key])registries[key]=registry[key];}
function visit(node){
 if(!node||typeof node!=='object')return;
 if(node.kind==='reference')ref(node.path);
 if(node.kind==='dispatcher'){
  const name=node.registry;if(!Object.hasOwn(dispatch,name)){
   const map=dispatch[name]=symbols['mcdoc/dispatcher'][name]??{};
   registryNames(name);for(const type of Object.values(map))visit(type);
  }
 }
 for(const a of node.attributes??[])if(a.name==='id'){const v=attrValue(a.value);registryNames(typeof v==='string'?v:v?.registry);}
 if(Array.isArray(node))for(const v of node)visit(v);else for(const v of Object.values(node))visit(v);
}
function ref(name){if(!Object.hasOwn(types,name)&&symbols.mcdoc[name]){types[name]=symbols.mcdoc[name];visit(types[name]);}}
const refType=path=>({kind:'reference',path}),leaf=kind=>({kind}),list=item=>({kind:'list',item}),structure=(fields,spreads=[])=>({kind:'struct',fields:[...Object.entries(fields).map(([key,type])=>({kind:'pair',key,type})),...spreads.map(type=>({kind:'spread',type}))]});
const dispatcher=registry=>({kind:'dispatcher',registry,parallelIndices:[{kind:'dynamic',accessor:['id']}]});
const entity=refType('::java::world::entity::AnyEntity'),blockEntity=structure({},[refType('::java::world::block::BlockEntity'),dispatcher('minecraft:block_entity')]);
const state=refType('::java::util::block_state::BlockState');
const roots={entity,blockEntity,structure:structure({DataVersion:leaf('int'),size:list(leaf('int')),author:leaf('string'),palette:list(state),palettes:list(list(state)),blocks:list(structure({pos:list(leaf('int')),state:leaf('int'),nbt:blockEntity})),entities:list(structure({pos:list(leaf('double')),blockPos:list(leaf('int')),nbt:entity}))})};
Object.values(roots).forEach(visit);
const out={source:{mcdoc:symbols.ref,mcmeta:'d96c75fec200c4580dd75e033a76341521165461',game:latest},version,roots,types,dispatch,registries};
fs.writeFileSync(path.join(__dirname,'..','media','nbt-catalog.json'),JSON.stringify(out));
console.log(`${Object.keys(types).length} types, ${Object.keys(dispatch).length} dispatchers, ${Object.keys(registries).length} registries`);
