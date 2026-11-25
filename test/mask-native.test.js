'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {normalizeLegacy}=require('../lib/mask-java');
const {jarMaskData}=require('../lib/assets'),traits=require('../media/mask-states.json');
const jar=process.env.VOXEL_MASK_JAR, libraries=process.env.VOXEL_MASK_LIBS;
const p=(type,props={})=>({type:'minecraft:'+type,...props});
const height=(min,max)=>p('height_range',{min_inclusive:min,max_inclusive:max});
const volume=(min,max,match)=>p('volume_match',{min,max,match});
const cells=[];
function row(name,props={},dv){const pos=[cells.length,0,0];cells.push({name,props,dv,pos});return pos;}
for(const n of ['stone','glass','oak_leaves','chest','iron_chain','cave_air','void_air','structure_void','short_grass','oak_log','oak_fence','glow_lichen','mud','scaffolding','oak_door','piston_head','spruce_trapdoor','shulker_box','moving_piston','powder_snow','snow'])row('minecraft:'+n);
for(const type of ['top','bottom','double'])for(const waterlogged of ['true','false'])row('minecraft:oak_slab',{type,waterlogged});
for(const half of ['top','bottom'])for(const facing of ['west','east','south','north'])row('minecraft:oak_stairs',{half,facing,waterlogged:'true'});
for(const n of ['water','lava'])for(const level of ['0','1','7','8','15'])row('minecraft:'+n,{level});
row('minecraft:oak_slab',{type:'typo',waterlogged:'true'});row('minecraft:oak_slab',{type:'top',waterlogged:'typo'});
row('stone');row('minecraft:not_a_real_block');
row('minecraft:chain',{axis:'y',waterlogged:'true'},4189);
row('minecraft:grass_path',{},2567);row('minecraft:brick_block',{},1343);row('minecraft:stained_hardened_clay',{color:'red'},1343);
cells.push({name:'minecraft:spruce_log',props:{},pos:[0,1,0]},{name:'minecraft:stone',props:{},pos:[1,1,0]},{name:'minecraft:stone',props:{},pos:[0,2,0]});
const positions=[...cells.map(c=>c.pos),[-1,0,0],[0,-1,0],[0,3,0],[0,1,1]];
const queries=[];
function add(rule,points=positions){queries.push({rule,positions:points});}
for(const type of ['solid','replaceable','true'])add(p(type));
for(const direction of ['down','up','east','west','north','south'])add(p('has_sturdy_face',{direction}));
for(const blocks of ['#minecraft:logs','minecraft:air','minecraft:dirt_path','minecraft:bricks','minecraft:red_terracotta','minecraft:iron_chain',['minecraft:stone','minecraft:glass'],['#minecraft:logs'],['#minecraft:logs','minecraft:stone'],[],['minecraft:made_up_block'],'#minecraft:no_such_tag'])add(p('matching_blocks',{blocks}));
for(const tag of ['minecraft:logs','#minecraft:logs','minecraft:missing_tag','minecraft:replaceable','minecraft:wooden_slabs'])add(p('matching_block_tag',{tag}));
for(const fluids of ['#minecraft:water','#minecraft:lava','minecraft:water','minecraft:flowing_water','minecraft:flowing_lava','minecraft:empty',['minecraft:water','minecraft:lava'],['#minecraft:water'],['not_a_fluid'],[]])add(p('matching_fluids',{fluids}));
for(const range of [[{absolute:-1},{absolute:3}],[{above_bottom:1},{below_top:1}],[{below_top:1},{below_top:0}],[{absolute:2},{absolute:1}],[{absolute:2031},{absolute:2031}],[{absolute:2032},{absolute:2032}],[{absolute:-2032},{absolute:-2032}],[{absolute:-2033},{absolute:-2033}],[{relative_to_sea_level:0},{relative_to_sea_level:1}]])add(height(...range));
for(const n of [1,16,17,32,33]){
 add(p('solid',{offset:[0,n,0]}));add(volume([0,0,0],[0,n,0],p('true')));
}
add(volume([0,0,0],[1,1,0],p('solid')));
add(volume([0,0,0],[0,2,0],p('not',{predicate:p('matching_blocks',{blocks:'minecraft:air'})})));
add(volume([0,-1,0],[0,0,0],height({absolute:-1},{below_top:0})));
add(volume([0,0,0],[1,0,0],p('all_of',{predicates:[p('solid'),p('any_of',{predicates:[p('matching_blocks',{blocks:'minecraft:glass'}),volume([0,1,0],[0,2,0],p('not',{predicate:p('replaceable')}))]})]})));
add(volume([1,0,0],[0,0,0],p('true')));
add(p('all_of',{predicates:[]}));add(p('any_of',{predicates:[]}));
add(p('solid',{typo:true}));add(p('solid',{offset:null}));add(p('solid',{offset:[0,0,0.5]}));

test('mask evaluation and codec agree with the configured Minecraft JAR', {skip:!jar||!libraries},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'voxel_mask_oracle_'));
 const j=path.join(__dirname,'MaskOracle.java'),input=path.join(root,'input.json'),output=path.join(root,'output.json');
 const cp=[jar,libraries].join(path.delimiter);
 function run(cmd,args){const result=spawnSync(cmd,args,{encoding:'utf8',cwd:root,timeout:120000});assert.equal(result.status,0,`${result.error||''}\n${result.stdout}\n${result.stderr}`);}
 try{
  await fs.writeFile(input,JSON.stringify({height:3,cells,queries}));
  run('javac',['-d',root,'-cp',cp,j]);run('java',['-cp',[root,cp].join(path.delimiter),'MaskOracle',jar,input,output]);
  const native=JSON.parse(await fs.readFile(output,'utf8'));
  const catalog={...await jarMaskData(jar),traits};
  const {compileMask,maskAir,maskStateKey}=await import('../media/mask.js');
  // Exercise the same upgrade helper the extension uses, then compare against the actual predicate codec and test().
  catalog.legacy=Object.create(null);
  for(const version of [...new Set(cells.map(c=>c.dv).filter(Number.isInteger))]){
   const rows=cells.filter(c=>c.dv===version),fixed=await normalizeLegacy(jar,version,rows);
   rows.forEach((row,i)=>catalog.legacy[maskStateKey(row)]=fixed[i]);
  }
  const strict=rule=>Object.hasOwn(rule,'typo')||rule.offset===null||rule.offset?.some(n=>!Number.isInteger(n))||rule.min_inclusive?.relative_to_sea_level!==undefined;
  const byPos=new Map(cells.map(s=>[String(s.pos),s])),get=(...pos)=>byPos.get(String(pos))??maskAir;
  const diffs=[];
  for(const [i,{rule,positions}] of queries.entries()){
   let actual;try{const m=compileMask(rule,catalog);actual=positions.map(pos=>m.test(get,3,...pos));}catch(e){actual=e.message;}
   const expected=native[i];
   if(strict(rule)){assert.equal(Array.isArray(expected),true);assert.equal(typeof actual,'string');continue;}
   if(Array.isArray(expected)!==Array.isArray(actual))diffs.push({rule,expected:Array.isArray(expected)?'valid':expected,actual:Array.isArray(actual)?'valid':actual});
   else if(Array.isArray(expected))for(const [i,pos] of positions.entries())if(actual[i]!==expected[i])diffs.push({rule,cell:get(...pos),pos,expected:expected[i],actual:actual[i]});
  }
  assert.deepEqual(diffs,[]);
  const tested=native.reduce((sum,item,i)=>sum+(Array.isArray(item)&&!strict(queries[i].rule)?item.length:0),0);
  assert.ok(tested>2000);console.log(`NATIVE_MASK_MATCH ${tested} evaluations; ${queries.length} codec cases`);
 }finally{
  if(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('voxel_mask_oracle_'))await fs.rm(root,{recursive:true,force:true});
 }
});
