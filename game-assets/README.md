# 游戏素材库

给修仙 / 都市等各类小游戏准备的免费素材。**全部为 CC0 授权**：可免费商用、可修改，不需要署名。

- `superpowers/`：2D 像素风素材（本文下面的内容）
- `3d/`：3D 低多边形 / 卡通素材，见 [`3d/README.md`](3d/README.md)

# 2D 像素风素材

## 来源

| 来源 | 作者 | 授权 | 原始地址 |
|---|---|---|---|
| Superpowers Asset Packs | Pixel-boy（Sparklin Labs） | CC0 1.0（见 `superpowers/LICENSE.txt`） | https://github.com/sparklinlabs/superpowers-asset-packs （commit `e8674a0`） |

> 署名非必需，但作者表示欢迎在游戏里提一句 “Assets by Pixel-boy / Sparklin Labs”。

## 目录说明

每个包的根目录都有 `preview*.png` 预览图，可以先看预览再挑。

### `superpowers/ninja-adventure/` —— ⭐ 修仙首选（东方像素风）
- `characters/`：25 个人物精灵图（4 方向，含行走和动作），`characters/faceset/` 是对话头像
- `monsters/`：22 个怪物
- `items/`：道具（丹药瓶、卷轴、宝箱、食物、钱袋……）
- `weapons/`：剑、弓、手里剑等
- `background-elements/`：地图瓦片 `tileset.png`、瀑布、植物
- `fx/`：法术 / 技能特效（gif 动图 + png 序列）
- `hud/`：血条、对话框
- `musics/`：19 首背景音乐（ogg）
- `sounds/`：45 个音效
- `font8x8.png`、`font30x30.png`：像素英文字体

### `superpowers/rpg-battle-system/` —— 回合制战斗（修仙 / 都市都能用）
- `char/`：主角战斗立绘，`monster/`：72 个怪物
- `backgrounds/`：31 张战斗背景（含夜间版）
- `item/`：81 个道具图标，`HUD/`：战斗菜单、血条
- `fx/`：攻击 / 法术特效，`music/`、`sound/`：战斗音乐与音效
- 参考 `mockup.png` 看整体效果

### `superpowers/backgrounds/` —— 场景背景图
- `backgrounds/`：41 张完整背景（森林、沙漠、雪山、**城市**、古建筑、熔岩……）
- `layers/`：拆分好的视差滚动图层

### `superpowers/medieval-fantasy/` —— 补充道具 / 怪物
- `items/`：76 个道具（药水、宝石、装备，可当法宝 / 灵药用）
- `monsters/`、`animals/`、`characters/`、`fx/`、`music/`、`sounds/`

### `superpowers/top-down-shooter/` —— 都市 / 现代题材
- 现代人物、汽车、枪械、街道地面瓦片、科技风 HUD

## 修仙 / 都市怎么搭配

| 需求 | 推荐目录 |
|---|---|
| 修仙主角 / NPC 头像 | `ninja-adventure/characters/faceset/` |
| 丹药、法宝、背包图标 | `ninja-adventure/items/`、`rpg-battle-system/item/`、`medieval-fantasy/items/` |
| 妖兽 / 敌人 | `ninja-adventure/monsters/`、`rpg-battle-system/monster/` |
| 技能 / 法术特效 | `ninja-adventure/fx/`、`rpg-battle-system/fx/` |
| 宗门 / 野外场景 | `backgrounds/backgrounds/`、`rpg-battle-system/backgrounds/` |
| 都市场景 | `backgrounds/`（城市背景）、`top-down-shooter/` |
| 背景音乐 / 音效 | 各包的 `music(s)/`、`sound(s)/` |

## 注意

- 像素图放大时，请关闭平滑缩放（CSS：`image-rendering: pixelated;`，Godot：Filter 设为 Nearest），否则会糊。
- 自带字体只有英文。中文像素字体（例如 Fusion Pixel、Ark Pixel）使用 SIL OFL 授权，同样可以免费商用，但不是 CC0，所以这里没有收录。
