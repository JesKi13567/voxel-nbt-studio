export const actions={view:'查看',place:'放置',paint:'涂刷',erase:'擦除',pick:'取样',extrude:'挤出',box:'框选',clearSelection:'清空选区',resize:'修改尺寸',paletteAdd:'复制调色板',paletteDelete:'删除调色板',axisXMinus:'沿 X− 一格',axisXPlus:'沿 X+ 一格',axisYMinus:'沿 Y− 一格',axisYPlus:'沿 Y+ 一格',axisZMinus:'沿 Z− 一格',axisZPlus:'沿 Z+ 一格',topView:'俯视',reset:'复位视角',flyView:'切换第一人称飞行',material:'切换材质',invisibleBlocks:'切换隐形方块显示',paletteState:'更改变体槽位',tileSave:'写入方块实体字段',tileDelete:'删除方块实体字段',toggleMoveTile:'切换方块实体移动',settings:'插件设置'};
export const defaults={flyView:'f',view:'1',place:'2',paint:'3',erase:'4',pick:'5',extrude:'s',box:'b',invisibleBlocks:'Tab',clearSelection:'Escape'};
export function keyFrom(e){
 let k=e.key;if(!k||['Control','Alt','Shift','Meta','AltGraph','Dead','Unidentified','Process'].includes(k))return null;
 if(k===' ')k='Space';else if(k.length===1)k=k.toLowerCase();
 return [e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Meta':'',k].filter(Boolean).join('+');
}
