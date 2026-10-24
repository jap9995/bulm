# 3D 素材库（低多边形 / 卡通风格）

**全部为 CC0 授权**：可免费商用、可修改，不需要署名。每个包都附有原始授权文件。

总计约 520 MB，2000 多个模型。模型格式以 `.glb` / `.gltf` 为主（Godot、Unity、Three.js、Blender 都能直接用），大部分还附带 `.fbx` / `.obj`。

## 目录一览

| 目录 | 作者 | 内容 | 适合 |
|---|---|---|---|
| `kaykit/` ⭐ | Kay Lousberg | 10 个风格统一的卡通低模包，见下表 | 各类 3D 游戏 |
| `lowpoly-library/` | Quaternius + Kenney | 222 个低模（人物、怪物、动物、汽车、建筑、食物、武器……），另附 222 个体素版和音效 | 原型、休闲游戏 |
| `kenney-starter-kits/` | Kenney | 5 个可直接运行的 Godot 4 游戏工程：城市建造、FPS、3D 平台跳跃、赛车、基础场景 | 学习 / 起步模板 |
| `kenney-space-kit/` | Kenney | 153 个太空科幻模型（飞船、基地、宇航员、地形） | 科幻 / 太空 |
| `superpowers-3d/` | Pixel-boy | 可换装人物（Blender + glTF）、载具（仅 .blend）、像素风战士部件 | 需要 Blender 再加工 |

### `kaykit/` 细分

| 包 | 内容 | 适合题材 |
|---|---|---|
| `Character-Pack-Adventures` | 骑士、法师、野蛮人、盗贼（带骨骼动画和武器） | 修仙 / 奇幻 RPG 主角 |
| `Character-Pack-Skeletons` | 骷髅战士、骷髅法师等（带动画） | 敌人 / 小怪 |
| `Dungeon-Remastered` | 200+ 地牢部件：墙、地板、宝箱、火把、陷阱 | 秘境 / 洞府 / 地牢 |
| `Medieval-Hexagon-Pack` | 六边形地块、建筑、树木、山川 | 宗门经营 / 策略地图 |
| `City-Builder-Bits` | 城市建筑、道路、车辆 | 都市 |
| `Furniture-Bits` | 室内家具 | 都市 / 室内场景 |
| `Restaurant-Bits` | 餐厅设备、食物 | 都市经营 / 模拟 |
| `Halloween-Bits` | 墓碑、南瓜、鬼屋道具 | 恐怖 / 节日 |
| `Space-Base-Bits` | 太空基地部件 | 科幻 |
| `Prototype-Bits` | 原型用的方块、靶子、障碍物 | 关卡白盒测试 |

每个 KayKit 包的模型都放在 `addons/<包名>/` 下，按格式分为 `fbx/`、`gltf/`、`obj/` 等子目录。整个 `addons` 文件夹可以直接拖进 Godot 工程使用。

## 注意事项

1. **`lowpoly-library/` 的模型经过压缩**，使用了 `EXT_meshopt_compression`：
   - Three.js：加载时调用 `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`
   - Godot / Unity / Blender 如果打不开，可以先解压：`npx gltf-transform copy 输入.glb 输出.glb`
   - 每个模型的出处见 `lowpoly-library/NOTICE`，id 与文件的对照见 `library/index.json`
2. **`kenney-starter-kits/` 是完整的 Godot 工程**：模型和音效是 CC0，代码是 MIT（见各工程的 `LICENSE`）。用 Godot 4 打开 `project.godot` 就能运行。
3. `superpowers-3d/3d-vehicles/` 只有 `.blend` 源文件，需要先用 Blender 导出成 glb / fbx。

## 来源

| 包 | 原始地址 |
|---|---|
| KayKit | https://github.com/KayKit-Game-Assets （各 `KayKit-*-1.0` 仓库） |
| lowpoly-library | npm 包 `@netforge/asset-library-files@0.2.0`（Quaternius、Kenney 素材的优化版） |
| kenney-starter-kits | https://github.com/KenneyNL （各 `Starter-Kit-*` 仓库） |
| kenney-space-kit | npm 包 `@anabis/kenney-space-kit-mirror@2.0.0`（原版：https://kenney.nl/assets/space-kit） |
| superpowers-3d | https://github.com/sparklinlabs/superpowers-asset-packs |
