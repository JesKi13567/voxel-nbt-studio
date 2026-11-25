'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const mod=import('../media/structure-command.js');
const eye=[3.75,4.2,5.5];

test('structure commands parse integer blocks, camera-relative offsets and compound SNBT',async()=>{
 const {parseStructureCommand:parse}=await mod;
 assert.deepEqual(parse('/setblock ~1 ~-0.5 ~ oak_log[axis=z] keep',eye),{cmd:'setblock',box:[[4,3,5],[4,3,5]],state:{name:'minecraft:oak_log',props:{axis:'z'}},mode:'keep'});
 assert.deepEqual(parse('/fill 0 0 0 2 2 2 stone',eye).box,[[0,0,0],[2,2,2]]);
 assert.deepEqual(parse('/summon pig ~0.25 2 4 {Tags:["hello world"],NoAI:1b}',eye),{cmd:'summon',id:'minecraft:pig',pos:[4,2,4.5],snbt:'{Tags:["hello world"],NoAI:1b}'});
 assert.throws(()=>parse('/setblock 1.25 0 0 stone',eye),/无效坐标/);
 assert.throws(()=>parse('/summon pig ^ ^ ^',eye),/无效坐标/);
 const base='/fill 0 0 0 2 2 2 stone';
 for(const mode of ['outline','hollow','destroy','strict','replace','keep'])assert.equal(parse(`${base} ${mode}`,eye).mode,mode);
 assert.deepEqual(parse(`${base} replace #logs[axis=y] hollow`,eye).blockFilter,{name:'minecraft:logs',props:{axis:'y'},tag:true});
 assert.equal(parse(`${base} replace chest{Items: [{Slot:0b}]} strict`,eye).blockFilter.snbt,'{Items: [{Slot:0b}]}');
 assert.equal(parse('/setblock 0 0 0 chest[facing=west]{CustomName:"hello world"} strict',eye).snbt,'{CustomName:"hello world"}');
 assert.throws(()=>parse(`${base} replace oak_log keep`,eye),/只可使用/);
 assert.throws(()=>parse('/setblock 0 0 0 chest {Items:[]}',eye),/模式/);
 assert.throws(()=>parse('/function example:foo',eye),/仅支持/);
});

test('coordinate completions preserve the remainder and expose the matching corner',async()=>{
 const {commandCompletions:complete}=await mod;
 const context={region:{lo:[1,2,3],hi:[4,5,6]},point:[7,1,2],states:{'minecraft:oak_log':{axis:{values:['x','y','z']}}},blockIds:['minecraft:oak_log'],entityIds:['minecraft:pig'],pick(){}};
 const at=(text,caret=text.length)=>complete(text,caret,context);
 assert.equal(at('/fill ').choices[0].text,'1 2 3 4 5 6 ');
 assert.equal(at('/fill 1 2 3 ').choices[0].text,'4 5 6 ');
 const text='/setblock 1 2 3 stone',c=at(text,text.indexOf('2'));
 assert.equal(text.slice(0,c.start)+c.choices[0].text+text.slice(c.end),'/setblock 7 1 2 stone');
 assert.equal(at('/setblock 0 0 0 minecraft:oak_log[ax').choices[0].text,'axis=');
 assert.equal(at('/summon pi').choices[0].text,'minecraft:pig ');
 assert.equal(at('/fill 0 0 0 2 2 2 stone hol').choices[0].text,'hollow ');
 assert.equal(at('/fill 0 0 0 2 2 2 stone replace oak_log out').choices[0].text,'outline ');
 assert.equal(complete('/fill 0 0 0 2 2 2 stone replace #lo',34,{...context,blockTags:['#minecraft:logs']}).choices[0].text,'#minecraft:logs ');
 assert.equal(complete('/setblock 0 0 0 chest',21,{...context,blockIds:['minecraft:chest'],tileTypes:{'minecraft:chest':'minecraft:chest'}}).choices[0].text,'chest{}');
 const unknown=complete('/setblock ',10,{...context,point:null});assert.equal(typeof unknown.choices[0].action,'function');
});
