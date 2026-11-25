'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {profileView,playerSkin}=require('../lib/player-skins');
const {Structure,create,clipHeadProfiles}=require('../lib/nbt');
const hash='ab'.repeat(32),uuid='1234567890abcdef1234567890abcdef';
const property=url=>Buffer.from(JSON.stringify({textures:{SKIN:{url,metadata:{model:'slim'}}}})).toString('base64');
const cdn='http://textures.minecraft.net/texture/'+hash;

test('profiles read UUID, ResourceLocation and embedded texture; untrusted URLs are ignored',()=>{
 assert.deepEqual(profileView('Real_Name'),{name:'Real_Name'});
 assert.deepEqual(profileView({id:[0,-1,0,1]}),{uuid:'00000000ffffffff0000000000000001'});
 assert.deepEqual(profileView({texture:'minecraft:entity/player/slim/ari',model:'slim'}),{resource:'minecraft:entity/player/slim/ari',model:'slim'});
 assert.deepEqual(profileView({properties:[{name:'textures',value:property(cdn)}]}),{hash,model:'slim'});
 assert.equal(profileView({texture:'minecraft:../bad'}),null);
 for(const url of [cdn+'?x=1','https://textures.minecraft.net.invalid/texture/'+hash,'http://127.0.0.1/texture/'+hash,'https://evil.example/textures.minecraft.net/texture/'+hash])
  assert.equal(profileView({properties:[{name:'textures',value:property(url)}]}),null);
});

test('skin lookup uses only HTTPS Mojang endpoints, validates image dimensions and caches results',async t=>{
 const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(64,16);png.writeUInt32BE(64,20);
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  if(url==='https://api.mojang.com/users/profiles/minecraft/MockSkin')return Response.json({id:uuid});
  if(url==='https://sessionserver.mojang.com/session/minecraft/profile/'+uuid)return Response.json({properties:[{name:'textures',value:property(cdn)}]});
  if(url==='https://textures.minecraft.net/texture/'+hash)return new Response(png);
  throw Error('Unexpected URL '+url);
 });
 const a=playerSkin({name:'MockSkin'}),b=playerSkin({name:'mockskin'});assert.equal(a,b);
 assert.deepEqual(await a,{hash,model:'slim',png:png.toString('base64')});assert.equal(calls.length,3);
 assert.equal(await playerSkin({name:'MockSkin/..',hash:'../../local'}),null);assert.equal(calls.length,3);
});

test('player-head profile survives NBT save, copy and undo',async()=>{
 const doc=await Structure.open(create([3,4,3])),p=[1,0,1],cell=doc.cell(p);
 doc.edit({tool:'fill',box:[p,p],state:{name:'minecraft:player_head',props:{rotation:'2'}},commandMode:'replace',snbt:'{profile:{id:[I;0,-1,0,1]}}'});
 const after=await Structure.open(await doc.serialize()),profile={uuid:'00000000ffffffff0000000000000001'};
 assert.deepEqual(after.snapshot().headProfiles,[[cell,profile]]);
 const clip=after.copySelection([cell],0,true);assert.deepEqual(clipHeadProfiles(clip),[[0,profile]]);
 const edit=after.edit({tool:'tile',cell,path:'profile',text:'"ChangedName"',allowTypeChange:true});
 assert.deepEqual(after.headProfile(cell,0),{name:'ChangedName'});after.apply(edit.changes,false,edit.tiles);
 assert.deepEqual(after.headProfile(cell,0),profile);
});
