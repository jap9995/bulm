# 《问道长生》游戏代码

> 设计文档在上一级的 `design/`；本目录是按那些文档实现的游戏引擎、内容配置和模拟脚本。
> 技术方案见 [../README.md](../README.md) 第 5 节第 9 条。

## 结构

```
game/
├── content/               内容配置（JSON）。改数值、加事件只改这里，不改代码
│   ├── realms.json        境界主表（systems 1.2、1.5）
│   ├── origins.json       出身（content-expansion 第一节）
│   ├── talents.json       天赋；带 "todo" 的天赋，效果还没有全部接上
│   ├── items.json         物品（systems 第 3 节）
│   ├── techniques.json    功法（systems 第 2 节）
│   ├── world.json         地点、集市、姓名池、特殊事件
│   ├── events/            事件（content-expansion 第五节）
│   └── combat/            斗法文字（由脚本从 design/combat-texts.md 导入，不要手改）
├── src/
│   ├── engine/            游戏引擎：纯 TypeScript，不碰网页、不依赖第三方库
│   │   ├── engine.ts      对外接口：newRun / actions / act / choose / buy / sell / usePill / equip
│   │   ├── types.ts       内容配置和局内状态的类型
│   │   ├── content.ts     组装内容并检查引用
│   │   ├── draw.ts        事件抽取（design/event-draw.md）
│   │   ├── combat.ts      斗法与文字拼接（content-expansion 0.5、combat-texts）
│   │   ├── market.ts      集市（design/market.md）
│   │   ├── effects.ts     条件、效果、文本模板（misc-rules 第五节）
│   │   ├── calc.ts        数值：战力、修为、寿元、耗时（systems 1.2、1.6，misc-rules 6.2）
│   │   └── rng.ts         种子随机数，四条独立的流（systems 7.1）
│   └── sim/bots.ts        模拟用的三种机器人（balance-targets 1.1）
├── scripts/
│   ├── sim.ts             模拟上千局，对照平衡指标
│   ├── import-combat.ts   把斗法文字从设计文档导入为 JSON
│   └── load.ts            在 Node 里读取 content/
└── test/engine.test.ts    确定性、不死锁、属性不越界等测试
```

## 常用命令

需要 Node 23.6 以上（直接运行 TypeScript，不需要编译）。

```bash
npm install            # 只装类型检查用的 TypeScript，引擎本身不依赖任何包
npm test               # 运行测试
npm run check          # 类型检查
npm run sim            # 每种机器人、每种出身各模拟 200 局
npm run sim -- 1000 steady          # 只跑稳健型，每种出身 1000 局
npm run sim -- 1 steady --log       # 打印一局的人生日志
npm run import-combat  # 设计文档里的斗法文字改了之后，重新导入
```

## 引擎的约定

- **引擎函数不修改传入的状态**，总是返回新的状态。界面、模拟脚本、以后的服务器重放都只调用 `engine.ts` 的导出函数。
- **确定性**：同一种子、同样的调用序列，结果完全一致（测试会检查）。机器人和界面不能直接调用 `Math.random`。
- **`actions()` 只读**：列出行动不会改变状态，也不会消耗随机数。
- **内容引用在加载时检查**：事件引用了不存在的物品、事件、功法、斗法文字时，`buildContent` 直接报错。

## 当前进度（第 1 步：引擎骨架 + 首批内容）

已经实现：开局、三种修炼、外出探索、集市买卖、拜访村落、研习功法、装备、服药；事件抽取的强制队列、剧情位、类别与权重、连续性控制、平静事件、机缘选项、特殊事件；斗法的四档结算与文字拼接；突破、失败后果、看广告免罚；保命顺序与看广告复活；寿元与结局（目前只分身死道消和寿终 / 坐化）。

还没有做：宗门、洞府、NPC 拜访与关系线、宿命、传记卡、因果录与解锁、每日天命、秘境、其余事件和特殊事件、各结局的完整判定，以及天赋里标了 `todo` 的效果。

首轮模拟暴露的问题（第 2 步要处理）：事件太少，平静事件占探索超过 20%；凝金草还没有来源，金丹以上的路断了；斗法次数偏多、胜率偏低；死亡率远低于目标。
