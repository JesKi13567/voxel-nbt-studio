'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const catalog=require('../media/nbt-catalog.json'),states=require('../media/state-schema.json');
const modules=Promise.all([import('../media/mcdoc.js'),import('../media/nbt-completion.js')]);
const keys=rows=>rows.map(row=>row.key);

test('Java mcdoc follows nested entity IDs and document versions',async()=>{
 const [{schemaContext,nbtFields,nbtValues}]=await modules;
 const entity={id:'minecraft:trial_spawner',spawn_data:{entity:{id:'minecraft:breeze'}}};
 const field=['spawn_data','entity'];const now=schemaContext(catalog,5023),old=schemaContext(catalog,3465);
 assert.ok(keys(nbtFields(now,'blockEntity',entity,field)).includes('attributes'));
 assert.deepEqual(keys(nbtFields(now,'blockEntity',entity,[...field,'attributes',0])),['id','base','modifiers']);
 assert.ok(keys(nbtFields(now,'blockEntity',entity,[...field,'active_effects',0])).includes('show_particles'));
 assert.ok(nbtValues(now,'blockEntity',entity,[...field,'active_effects',0,'id']).some(v=>v.text==='"minecraft:speed"'));
 assert.deepEqual(nbtValues(now,'blockEntity',entity,[...field,'active_effects',0,'ambient']).map(v=>v.text),['0b','1b']);
 assert.ok(keys(nbtFields(old,'entity',{id:'minecraft:pig'})).includes('Attributes'));
 assert.ok(!keys(nbtFields(old,'entity',{id:'minecraft:pig'})).includes('attributes'));
});

test('structure properties, inherited item generics and custom NBT paths complete safely',async()=>{
 const [{schemaContext,nbtFields,nbtValues},{completionAt}]=await modules;
 const ctx=schemaContext(catalog,5023,states);
 const root={palette:[{id:'minecraft:oak_log',properties:{}}]};
 assert.deepEqual(nbtValues(ctx,'structure',root,['palette',0,'properties','axis']).map(v=>v.label),['x','y','z']);
 const box={id:'minecraft:barrel'};
 assert.ok(keys(nbtFields(ctx,'blockEntity',box,['Items',0,'components'])).includes('minecraft:unbreakable'));
 assert.equal(nbtValues(ctx,'blockEntity',box,['Items',0,'components','minecraft:unbreakable'])[0].type,10);
 const resolve=(text,root)=>completionAt(text.replace('|',''),text.indexOf('|'),{ctx,root});
 const text='{id:"minecraft:breeze",active_effects:[{id:"spe|",duration:60}]}';
 const result=resolve(text,'entity');assert.equal(result.choices[0].text,'"minecraft:speed"');
 assert.equal(text.replace('|','').slice(result.start,result.end),'"spe"');
 const plain='{id:"minecraft:breeze",active_effects:[{id:minecraft:spe|}]}';
 const fixed=resolve(plain,'entity');assert.equal(fixed.choices[0].text,'"minecraft:speed"');
 assert.equal(plain.replace('|','').slice(fixed.start,fixed.end),'minecraft:spe');
 const jigsaw=nbtValues(ctx,'blockEntity',{id:'minecraft:jigsaw'},['pool']);
 assert.ok(jigsaw.some(v=>v.label==='minecraft:village/plains/town_centers'));

 assert.ok(!resolve('{id:"minecraft:pig",Health:1f,|}','entity').choices.some(v=>v.label==='Health'));
 assert.deepEqual(resolve('{mod_custom:{unk|}}','entity').choices,[]);
});
