// Common Java fields transcribed as editing hints, not an exhaustive validation schema.
// Minecraft Wiki: Block entity format / NBT format. Checked current field names against 26.3 templates.
const inv=[['Items','List','[]','物品槽列表'],['LootTable','String','"minecraft:chests/simple_dungeon"','战利品表 ID'],['LootTableSeed','Long','0L','战利品表种子'],['lock','Compound','{}','容器的锁定条件']];
const common=[['components','Compound','{}','附加数据组件']];
const counters=(type,text,names)=>names.split(' ').map(n=>[n,type,text]);
const rows={
 chest:inv,trapped_chest:inv,barrel:inv,shulker_box:inv,dropper:inv,dispenser:inv,
 hopper:[...inv,['TransferCooldown','Int','0','传输冷却刻数']],
 crafter:[...inv,['disabled_slots','IntArray','[I;]'],['triggered','Byte','0b'],['crafting_ticks_remaining','Int','0']],
 shelf:[['Items','List','[]'],['align_items_to_bottom','Byte','0b']],chiseled_bookshelf:[['Items','List','[]'],['last_interacted_slot','Int','-1']],
 banner:[['patterns','List','[{pattern:"minecraft:stripe_center",color:"red"}]','旗帜图案及颜色']],
 brewing_stand:[['Items','List','[]'],['Fuel','Byte','0b'],['BrewTime','Short','0s']],
 furnace:[['Items','List','[]'],['RecipesUsed','Compound','{}'],...counters('Short','0s','lit_total_time cooking_time_spent cooking_total_time lit_time_remaining')],
 campfire:[['Items','List','[]'],['CookingTimes','IntArray','[I;0,0,0,0]'],['CookingTotalTimes','IntArray','[I;0,0,0,0]']],
 jigsaw:[['pool','String','"minecraft:empty"','目标拼图池 ID'],['name','String','"minecraft:empty"','此连接点的名字'],['target','String','"minecraft:empty"','匹配的连接点名字'],['final_state','String','"minecraft:air"','生成后替换成的方块状态字符串'],['joint','String','"rollable"','rollable 或 aligned'],['selection_priority','Int','0','选择优先级'],['placement_priority','Int','0','放置优先级']],
 mob_spawner:[['SpawnData','Compound','{entity:{id:"minecraft:skeleton"}}','下一只怪物'],['SpawnData.entity','Compound','{id:"minecraft:skeleton"}'],['SpawnData.entity.id','String','"minecraft:skeleton"'],['SpawnPotentials','List','[{weight:1,data:{entity:{id:"minecraft:skeleton"}}}]'],...counters('Short','0s','Delay MinSpawnDelay MaxSpawnDelay SpawnCount MaxNearbyEntities RequiredPlayerRange SpawnRange')],
 trial_spawner:[['normal_config','String 或 Compound','"minecraft:trial_chamber/ranged/skeleton/normal"','普通配置 ID 或内联配置'],['ominous_config','String 或 Compound','"minecraft:trial_chamber/ranged/skeleton/ominous"','不祥配置 ID 或内联配置'],['required_player_range','Int','14'],['target_cooldown_length','Int','36000'],['next_mob_spawns_at','Long','0L'],['total_mobs_spawned','Int','0'],['spawn_data','Compound','{entity:{id:"minecraft:skeleton"}}'],['ejecting_loot_table','String','"minecraft:chests/trial_chambers/reward"']],
 vault:[['config','Compound','{}','宝库配置'],['config.loot_table','String','"minecraft:chests/trial_chambers/reward"','奖励战利品表'],['config.override_loot_table_to_display','String','"minecraft:chests/trial_chambers/reward"'],['config.key_item','Compound','{id:"minecraft:trial_key",count:1}'],['config.key_item.id','String','"minecraft:trial_key"'],['config.key_item.count','Int','1'],['config.activation_range','Double','4d'],['config.deactivation_range','Double','4.5d'],['shared_data','Compound','{}'],['server_data','Compound','{}']],
 beehive:[['bees','List','[]'],['flower_pos','IntArray','[I;0,0,0]']],
 lectern:[['Book','Compound','{id:"minecraft:written_book",count:1}'],['Page','Int','0']],
 decorated_pot:[['sherds','Compound','{}','26.3 的四面陶片'],['item','Compound','{id:"minecraft:brick",count:1}'],['LootTable','String','"minecraft:empty"'],['LootTableSeed','Long','0L']],
 brushable_block:[['item','Compound','{id:"minecraft:brick",count:1}'],['LootTable','String','"minecraft:archaeology/desert_pyramid"'],['LootTableSeed','Long','0L']],
 jukebox:[['RecordItem','Compound','{id:"minecraft:music_disc_13",count:1}'],['ticks_since_song_started','Long','0L']],
 command_block:[['Command','String','""','命令文本；编辑器不会执行'],['CustomName','文本组件','"@"'],['auto','Byte','0b'],['TrackOutput','Byte','0b'],['SuccessCount','Int','0']],
 structure_block:[...counters('String','""','name author metadata'),...counters('Int','0','posX posY posZ sizeX sizeY sizeZ'),['mode','String','"LOAD"'],['mirror','String','"NONE"'],['rotation','String','"NONE"'],['integrity','Float','1f'],['seed','Long','0L'],...counters('Byte','0b','ignoreEntities powered showair showboundingbox')],
 comparator:[['OutputSignal','Int','0']],skull:[['profile','String 或 Compound','{}']],copper_golem_statue:[['pose','String','"standing"']]
};
export const tagTypes=['End','Byte','Short','Int','Long','Float','Double','ByteArray','String','List','Compound','IntArray','LongArray'];
export function hints(type,dv){
 const k=String(type||'').replace(/^minecraft:/,'');let a=Object.hasOwn(rows,k)?rows[k]:[];
 if(a.some(r=>r[0]==='lock')&&dv!==null&&dv<4080)a=a.map(r=>r[0]==='lock'?['Lock','String','""','旧版容器锁定名称']:r);
 if(['smoker','blast_furnace'].includes(k))a=rows.furnace;
 if(k==='decorated_pot'&&dv!==null&&dv<5023)a=a.map(r=>r[0]==='sherds'?['sherds','List','["minecraft:brick","minecraft:brick","minecraft:brick","minecraft:brick"]']:r);
 if(k==='soul_campfire')a=rows.campfire;
 if(k==='furnace'||k==='smoker'||k==='blast_furnace')if(dv!==null&&dv<3953)a=[...a.slice(0,2),...counters('Short','0s','BurnTime CookTime CookTimeTotal')];
 if(k==='sign'||k==='hanging_sign'){
   const messages=dv!==null&&dv<4325?'[\'""\',\'""\',\'""\',\'""\']':'["","","",""]';
   a=[['is_waxed','Byte','0b','是否已涂蜡'],...(dv>=5023?[['allow_op_features','Byte','0b','是否启用 26.3 的受限点击事件']]:[])];
   if(dv!==null&&dv<3463)a.push(...counters('String','\'""\'','Text1 Text2 Text3 Text4'));
   else for(const face of ['front_text','back_text'])a.push([face,'Compound',`{messages:${messages},color:"black",has_glowing_text:0b}`],[face+'.messages','List',messages,'四行文字'],[face+'.color','String','"black"'],[face+'.has_glowing_text','Byte','0b']);
 }
 return [...a,...(dv===null||dv>=3837?common:[])];
}
