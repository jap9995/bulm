// 《问道长生》引擎的类型定义：内容配置（content/*.json）和局内状态（RunState）
// 引擎不碰网页、不依赖第三方库，浏览器、Node 模拟脚本、以后的服务器重放都用同一份

// ───────────── 内容配置 ─────────────

export type Category = 'fortune' | 'danger' | 'resource' | 'encounter' | 'moral' | 'special' | 'calm' | 'seclusion';
export type Tier = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Rarity = 'common' | 'rare' | 'epic' | 'legend';
export type Approach = 'fight' | 'technique' | 'item' | 'env' | 'talk' | 'flee';
export type DuelTier = 'big' | 'win' | 'lose' | 'bad';
export type EnemyStrength = 'lower_realm' | 'same' | 'higher_layer' | 'higher_realm' | 'higher_two';

/** 来自出身、天赋、功法、装备的修正。全部可选，按 misc-rules 6.2 的口径合并：加成相加，乘数相乘 */
export interface Mods {
  cultAdd?: number;          // 修为加成（相加）
  lifespan?: number;         // 寿元上限 +N 年
  powerAdd?: number;         // 战力加成（相加）
  fightAdd?: number;         // 正面迎战胜率 +（小数）
  fleeAdd?: number;          // 逃跑成功率 +
  talkAdd?: number;          // 交涉 / 巧舌判定 +
  itemDuelAdd?: number;      // 借助道具时额外 +
  envAdd?: number;           // 利用环境判定 +
  injuryReduce?: number;     // 受伤概率 -（相加）
  heavyToLight?: boolean;    // 重伤降为轻伤
  dangerMult?: number;       // 危险类权重 ×
  fortuneOption?: number;    // 机缘选项出现率 +（气运加身 0.3）
  previewCategory?: boolean; // 灵觉敏锐：外出探索前看到类别
  dangerWarn?: boolean;      // 胆小如鼠：危险预警
  buyMult?: number;          // 集市买入价 ×
  sellMult?: number;         // 卖出价 ×
  marketSlots?: number;      // 随机货 +N 栏
  rareSlot?: number;         // 稀有栏 +N
  timeMult?: number;         // 所有行动耗时 ×
  learnMult?: number;        // 学习功法耗时 ×
  heartDemonMult?: number;   // 心魔概率 ×
  npcAff?: number;           // 所有 NPC 初始好感 +
  poisonImmune?: boolean;
}

export interface FailureRule { cult: number; foundation: number; heavy: number; light: boolean; dropLayer: number; death: number }

export interface Realm {
  id: string; name: string;
  layers: number;              // 小层级数：炼气 9，其余 4（初、中、后、圆满）
  perLayer: number;            // 每层需要的普通修炼次数
  lifespan: number | null;     // 寿元上限（炼气为 null：依出身）
  timeCoef: number; stoneCoef: number;
  powerBase: number; powerStep: number;
  breakRate: number | null;    // 突破到本境界的基础成功率
  material: string | null;     // 突破到本境界需要的材料
  materialCount: number;
  failure: { normal: FailureRule; forced: FailureRule } | null;
}

export interface Origin {
  id: string; name: string; desc: string; unlocked: boolean;
  layer: number; stones: number; lifespan: number;
  foundation?: number; luck?: number; mood?: number; dao?: number;
  items?: Record<string, number>; equip?: string[]; techniques?: string[];
  mods?: Mods; tags?: string[];
}

export interface Talent { id: string; name: string; rarity: Rarity; desc: string; unlocked: boolean; mods?: Mods; luck?: number; mood?: number; foundation?: number; todo?: string }

export type ItemKind = 'pill' | 'charm' | 'material' | 'breakthrough' | 'equip' | 'technique' | 'recipe' | 'key';
export interface Item {
  id: string; name: string; kind: ItemKind; grade: string;
  price: number | null;        // N×（乘购买时的灵石系数）；null = 不出售
  fixedPrice?: number;         // 不乘系数的价格（筑基丹 200）
  sell?: number;               // 物品表写明的出售价（N×）
  tox?: number;                // 丹毒
  use?: Effect[];              // 服用 / 使用的效果
  duel?: number;               // 借助道具时的斗法加成
  slot?: 'weapon' | 'armor' | 'accessory';
  mods?: Mods;
  technique?: string;          // kind=technique：对应的功法
  tags?: string[];             // 随机物品用的标签：pill_yellow、herb、beast……
}

export interface Technique { id: string; name: string; school: string; grade: string; mods?: Mods; duelAdd?: number; moves: string[] }

export interface Location { id: string; name: string; explore: boolean; secret?: boolean; categories?: Partial<Record<Category, number>>; reward?: number; unlock?: Cond[] }

export type Cond =
  | { stat: StatKey; gte?: number; lte?: number }
  | { realmGte: number } | { realmLte: number } | { layerGte: number }
  | { actionsGte: number } | { ageGte: number } | { ageLt: number }
  | { hasItem: string; n?: number } | { notItem: string }
  | { flag: string } | { notFlag: string }
  | { seen: string } | { origin: string } | { talent: string }
  | { npcAffGte: [string, number] } | { npcMet: string } | { notNpcMet: string }
  | { status: StatusKey } | { notStatus: StatusKey }
  | { world: string } | { lifeLeftLt: number } | { gender: 'm' | 'f' }
  | { technique: string } | { anyOf: Cond[] } | { exploresGte: number }
  | { equipped: 'weapon' | 'armor' | 'accessory' };

export type StatKey = 'foundation' | 'luck' | 'mood' | 'dao' | 'tox';
export type StatusKey = 'light' | 'heavy' | 'poison' | 'heartDemon';

export type Effect =
  | { cult: number }                      // 修为 +X（当前小层级的比例）
  | { stones: number }                    // 灵石 +N×（× 当前灵石系数）；负数为扣
  | { stonesPct: number }                 // 灵石 ±百分比（-0.5 = 失去一半）
  | { item: string; n?: number }          // 获得 / 失去物品
  | { randomItem: string; n?: number }    // 按标签随机物品：pill_yellow、herb、material……
  | { loseRandomItem: number }            // 丢失 N 件随机物品
  | { stat: StatKey; add: number }
  | { status: StatusKey }                 // 获得状态
  | { cure: StatusKey | 'injury' | 'all' }
  | { years: number }                     // 额外耗时（炼气期年数，× 时间系数）
  | { lifespan: number }                  // 寿元上限 ±
  | { npc: string; add: number }          // NPC 好感
  | { meet: string }                      // 首遇
  | { faction: string; add: number }
  | { flag: string; value?: number | boolean | string }
  | { schedule: string; after: number }   // N 次行动后触发（进入强制队列）
  | { chain: string }                     // 结算后立刻接一个事件
  | { ready: string; locations: string[] } // 进入剧情位
  | { learn: string }                     // 学会功法
  | { die: string }                       // 死亡（死因）
  | { log: string; weight: number }       // 写一条人生日志
  | { lend: number }                      // 借出当前灵石的一部分（记下金额）
  | { repay: number };                    // 归还借出的灵石 × 倍数

export interface Branch { effects?: Effect[]; text?: string }

export interface Enemy { strength: EnemyStrength; count?: 1 | 2 | 3; kind?: 'beast' | 'cultivator' | 'array'; combat?: string }

export type Result =
  | { type: 'fixed'; effects?: Effect[]; text?: string }
  | { type: 'chance'; p: number; luck?: boolean; stat?: StatKey; success: Branch; fail: Branch }
  | { type: 'duel'; enemy: Enemy; approach: Approach; bonus?: number; tiers?: Partial<Record<DuelTier, Branch>> };

export interface OptionDef {
  text: string; hint: string;
  requires?: Cond[];             // 不满足时不显示
  cost?: Effect[];               // 主动代价：不够时置灰（misc-rules 5.1）
  time?: number;                 // 额外耗时（炼气期年数）
  result: Result;
}

export interface EventDef {
  id: string; name: string; category: Category; locations: string[]; tier: Tier;
  tags?: string[]; repeatable?: boolean; cooldown?: number;
  conditions?: Cond[]; unlock?: Cond[];
  chainOnly?: boolean;           // 只能由前置事件、强制队列、剧情位触发
  combat?: string;               // 本事件斗法使用的文字（combat/*.json）
  text: string;
  options: OptionDef[];
}

export type Frag = string | { tags: string[]; text: string; only?: boolean };   // only：满足条件时只用这些片段（如〔道侣〕变体）
export interface CombatText {
  id: string; name: string;
  enemy?: string;                // {敌人} 的称呼
  locations?: string[];          // 可重复妖兽：在哪些地点出现（combat-texts 1.4）
  traits?: { pack?: number; thickHide?: boolean; venom?: boolean; brute?: boolean; swift?: boolean };
  open: Frag[];
  clash: Partial<Record<Approach, Frag[]>>;
  result: Record<DuelTier, Frag[]>;
  after: { win: Frag[]; lose: Frag[] };
  flee?: { ok: Frag[]; fail: Frag[] };
  talk?: { ok: Frag[]; fail: Frag[] };
  extra?: Record<string, Frag[]>;   // 专属片段，例如劫修「给他灵石」、洞府防御
}

export interface SpecialDef { id: string; name: string; weight: number; conditions?: Cond[]; once?: boolean; text: string; world?: { id: string; actions: number }; effects?: Effect[] }

export interface MarketConfig {
  staples: { item: string; stock: number }[];
  randomSlots: number; rareBase: number; rarePerLuck: number; refreshEvery: number;
  common: { item: string; weight: number; stock: [number, number] }[];
  rare: { item: string; weight: number; stock: [number, number] }[];
  foundationPill: { item: string; fromLayer: number; stock: number };
  sellRatio: number;
}

export interface Content {
  realms: Realm[];
  origins: Origin[]; talents: Talent[];
  items: Record<string, Item>; techniques: Record<string, Technique>;
  locations: Record<string, Location>;
  events: Record<string, EventDef>;
  combat: Record<string, CombatText>;
  specials: SpecialDef[];
  market: MarketConfig;
  names: { surnames: string[]; given: string[] };
}

// ───────────── 局内状态 ─────────────

export type StreamName = 'event' | 'check' | 'loot' | 'text';

export interface PendingOption { index: number; text: string; hint: string; enabled: boolean; reason?: string; fortune?: boolean }
export interface Pending { event: string; text: string; options: PendingOption[]; fortune?: boolean; source: 'normal' | 'forced' | 'story' | 'chain' | 'special' }

export interface LogEntry { age: number; type: string; weight: number; text: string }

export interface RunState {
  v: 1;
  seed: number;
  rng: Record<StreamName, number>;
  steps: number;              // 选择次数（包括行动和事件选项），用于确定性与统计
  actions: number;            // 行动次数（周期、冷却按它计算）
  gender: 'm' | 'f'; name: string;
  origin: string; talents: string[];
  realm: number; layer: number; cult: number;
  age: number; lifeBonus: number;          // 寿元加成（出身折算 + 天赋 + 事件）
  stones: number;
  foundation: number; luck: number; mood: number; dao: number; tox: number;
  status: { light: number; heavy: number; poison: boolean; heartDemon: boolean; everHeavy: boolean };
  bag: Record<string, number>; keyItems: Record<string, number>;
  equip: { weapon?: string; armor?: string; accessory?: string };
  techniques: string[];
  location: string;
  npcs: Record<string, { aff: number; met: boolean; dead?: boolean }>;
  factions: Record<string, number>;
  seen: Record<string, number>; lastSeen: Record<string, number>;
  queue: { event: string; due: number; prio: number }[];
  ready: { event: string; locations: string[]; since: number }[];
  flags: Record<string, number | boolean | string>;
  world: { id: string; until: number }[];
  special: { count: number; until: number };
  recent: Category[];                       // 最近的普通事件类别（连续性控制）
  sinceFortune: number;
  preCategory: Record<string, Category>;    // 预抽的类别（event-draw 4.1）
  exploreStreak: { loc: string; n: number };
  breakCooldown: boolean;
  ads: { revive: boolean; relief: number[] };
  market: { refreshedAt: number; shelf: { item: string; stock: number; rare: boolean }[] } | null;
  stats: { duels: number; duelWins: number; kills: number; breakthroughs: number; breakFails: number; adsWatched: number; calm: number; explores: number; events: number };
  log: LogEntry[];
  pending: Pending | null;
  ended: { ending: string; cause?: string } | null;
}

/** 一次行动或选择之后给界面的输出 */
export interface View { text: string[]; pending: Pending | null; ended: RunState['ended'] }
