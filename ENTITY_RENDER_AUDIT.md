# Voxel NBT Studio 0.15.15 · 实体静态预览排查

使用本机校验通过的原版 26.3 客户端 JAR，遍历 161 个注册实体类型并运行原版渲染器的静态提交步骤。下表记录是否得到可离线显示的模型，不等同于所有 NBT 状态均与游戏画面一致。

- 134 个类型得到原版模型或独立纹理几何；共 232 项模型条目（含导出的幼体和变种）。
- 27 个类型在此离线流程中没有可显示模型，保留占位框。
- 用真实 WebGL 与 JAR 贴图额外验证了嗅探兽、其幼体、普通船、运输船、竹筏、红色坐垫、寒带猪、暖带青蛙、史莱姆透明层。

## 有静态模型（134）

`acacia_boat`、`acacia_chest_boat`、`allay`、`armadillo`、`armor_stand`、`arrow`、`axolotl`、`bamboo_chest_raft`、`bamboo_raft`、`bat`、`bee`、`birch_boat`、`birch_chest_boat`、`blaze`、`bogged`、`breeze`、`breeze_wind_charge`、`camel`、`camel_husk`、`cat`、`cave_spider`、`cherry_boat`、`cherry_chest_boat`、`chest_minecart`、`chicken`、`cod`、`command_block_minecart`、`copper_golem`、`cow`、`creaking`、`creeper`、`cushion`、`dark_oak_boat`、`dark_oak_chest_boat`、`dolphin`、`donkey`、`dragon_fireball`、`drowned`、`elder_guardian`、`end_crystal`、`ender_dragon`、`enderman`、`endermite`、`evoker`、`evoker_fangs`、`experience_orb`、`fox`、`frog`、`furnace_minecart`、`ghast`、`giant`、`glow_squid`、`goat`、`guardian`、`happy_ghast`、`hoglin`、`hopper_minecart`、`horse`、`husk`、`illusioner`、`iron_golem`、`jungle_boat`、`jungle_chest_boat`、`leash_knot`、`llama`、`llama_spit`、`magma_cube`、`mangrove_boat`、`mangrove_chest_boat`、`minecart`、`mooshroom`、`mule`、`nautilus`、`oak_boat`、`oak_chest_boat`、`ocelot`、`pale_oak_boat`、`pale_oak_chest_boat`、`panda`、`parched`、`parrot`、`phantom`、`pig`、`piglin`、`piglin_brute`、`pillager`、`polar_bear`、`poplar_boat`、`poplar_chest_boat`、`pufferfish`、`rabbit`、`ravager`、`salmon`、`sheep`、`shulker`、`shulker_bullet`、`silverfish`、`skeleton`、`skeleton_horse`、`slime`、`sniffer`、`snow_golem`、`spawner_minecart`、`spectral_arrow`、`spider`、`spruce_boat`、`spruce_chest_boat`、`squid`、`stray`、`strider`、`sulfur_cube`、`tadpole`、`tnt_minecart`、`trader_llama`、`trident`、`tropical_fish`、`turtle`、`vex`、`villager`、`vindicator`、`wandering_trader`、`warden`、`wind_charge`、`witch`、`wither`、`wither_skeleton`、`wither_skull`、`wolf`、`zoglin`、`zombie`、`zombie_horse`、`zombie_nautilus`、`zombie_villager`、`zombified_piglin`

## 仍显示占位框（27）

| 实体 | 原版静态提交排查结果 |
| --- | --- |
| `area_effect_cloud` | 没有独立实体贴图的静态几何提交 |
| `block_display` | 没有独立实体贴图的静态几何提交 |
| `egg` | 没有独立实体贴图的静态几何提交 |
| `ender_pearl` | 没有独立实体贴图的静态几何提交 |
| `experience_bottle` | 没有独立实体贴图的静态几何提交 |
| `eye_of_ender` | 没有独立实体贴图的静态几何提交 |
| `falling_block` | 没有独立实体贴图的静态几何提交 |
| `fireball` | 没有独立实体贴图的静态几何提交 |
| `firework_rocket` | 没有独立实体贴图的静态几何提交 |
| `fishing_bobber` | 依赖运行中的客户端渲染器 |
| `glow_item_frame` | 没有独立实体贴图的静态几何提交 |
| `interaction` | 没有独立实体贴图的静态几何提交 |
| `item` | 没有独立实体贴图的静态几何提交 |
| `item_display` | 没有独立实体贴图的静态几何提交 |
| `item_frame` | 没有独立实体贴图的静态几何提交 |
| `lightning_bolt` | 没有独立实体贴图的静态几何提交 |
| `lingering_potion` | 没有独立实体贴图的静态几何提交 |
| `mannequin` | 不走通用实体渲染器的注册路径 |
| `marker` | 没有独立实体贴图的静态几何提交 |
| `ominous_item_spawner` | 没有独立实体贴图的静态几何提交 |
| `painting` | 依赖客户端画作图集 |
| `player` | 不走通用实体渲染器的注册路径 |
| `small_fireball` | 没有独立实体贴图的静态几何提交 |
| `snowball` | 没有独立实体贴图的静态几何提交 |
| `splash_potion` | 没有独立实体贴图的静态几何提交 |
| `text_display` | 没有独立实体贴图的静态几何提交 |
| `tnt` | 没有独立实体贴图的静态几何提交 |

独立纹理预览不模拟物品/方块图集、文字、乘客、实时动画、动态装备与粒子。上面的范围不包含模组实体。
