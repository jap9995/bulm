// 洞府：获得、建筑、灵田、回洞府时的事件
// 规则：systems 第 6 节、event-draw 4.6
import type { Content, RunState } from './types.ts';
import { addItem, count } from './effects.ts';
import { stoneCoef } from './calc.ts';
import { chance } from './rng.ts';

/** 得到洞府（每局一座；已有时不替换） */
export function grantAbode(c: Content, st: RunState, out: string[], how: string): void {
  if(st.abode) return;
  st.abode = { since: st.age, slots: c.abode.baseSlots, buildings: {}, leftAt: st.actions, fieldReady: null };
  out.push('从此你有了自己的洞府。');
  st.log.push({ age: Math.floor(st.age), type: 'abode', weight: 4, text: how });
}

const lv = (st: RunState, id: string) => st.abode?.buildings[id] ?? 0;

/** 在洞府闭关的修为加成：洞府 +10%，聚灵阵 +15%、每级再 +10% */
export function abodeCultAdd(c: Content, st: RunState): number {
  if(st.location !== 'abode' || !st.abode) return 0;
  const j = lv(st, 'juling');
  return c.abode.cultAdd + (j ? 0.15 + 0.1 * (j - 1) : 0);
}
export const quietRoom = (st: RunState) => st.location === 'abode' ? lv(st, 'jingshi') : 0;
export const wardBonus = (st: RunState) => st.location === 'abode' ? lv(st, 'hushan') * 0.2 : 0;

/** 回到洞府：最多出一个事件，按 被袭 > 丰收 > 虫害 > 梦中授法 > 邻居来访（event-draw 4.6） */
export function arriveAbode(c: Content, st: RunState): string | undefined {
  const a = st.abode!;
  const away = st.actions - a.leftAt;
  if(away > 0 && chance(st, 'event', Math.min(0.3, away * 0.02))) return 'A_raid';
  if(a.fieldReady !== null && st.actions >= a.fieldReady) return 'Z06';
  if(lv(st, 'lingtian') && a.fieldReady !== null && !st.flags.pest && chance(st, 'event', 0.1)) return 'A_pest';
  if(st.luck >= 15 && !st.seen.J14 && chance(st, 'event', 0.1)) return 'J14';
  if(st.age - a.since >= 5 && !st.seen.A_neighbor && chance(st, 'event', 0.15)) return 'A_neighbor';
  return undefined;
}

/** 收获灵田：基础 5 株，每级 +2；留种翻倍，虫害减半。收完立刻种下一季 */
export function harvest(c: Content, st: RunState, part: number, out: string[]): void {
  const a = st.abode; if(!a) return;
  let n = (c.abode.harvest + 2 * (lv(st, 'lingtian') - 1)) * part;
  if(st.flags.seedDouble){ n *= 2; delete st.flags.seedDouble; }
  if(st.flags.pest){ n /= 2; delete st.flags.pest; }
  n = Math.max(1, Math.round(n));
  const got: Record<string, number> = {};
  for(let i = 0; i < n; i++){
    const id = chance(st, 'loot', 0.1) ? 'jiuye_lingzhi' : st.realm >= 1 && chance(st, 'loot', 0.2) ? 'ningjin_cao' : chance(st, 'loot', 0.5) ? 'ninglu_cao' : 'chixue_shen';
    got[id] = (got[id] ?? 0) + 1;
  }
  for(const [id, k] of Object.entries(got)) addItem(c, st, id, k, out);
  a.fieldReady = st.actions + c.abode.growActions;
}

/** 建筑列表：能不能建、为什么不能 */
export function buildings(c: Content, st: RunState) {
  if(!st.abode || st.location !== 'abode') return [];
  const a = st.abode, used = Object.keys(a.buildings).length;
  return Object.entries(c.abode.buildings).map(([id, b]) => {
    const level = a.buildings[id] ?? 0;
    const cost = Math.round(b.cost * Math.pow(c.abode.upgradeMult, level) * stoneCoef(c, st));
    const reason = b.todo ? b.todo
      : level >= c.abode.maxLevel ? '已经是最高级'
      : !level && used >= a.slots ? '建筑位已满，需要扩建'
      : !level && b.needItem && count(st, b.needItem) === 0 ? `需要${c.items[b.needItem].name}`
      : !level && b.needSchool && !st.techniques.some(t => c.techniques[t]?.school === b.needSchool) ? '需要阵道功法'
      : st.stones < cost ? `灵石不足（需要 ${cost}）` : undefined;
    return { id, name: b.name, desc: b.desc, level, cost, enabled: !reason, reason };
  });
}

export function build(c: Content, st0: RunState, id: string): RunState {
  const st = structuredClone(st0);
  const b = buildings(c, st).find(x => x.id === id);
  if(!b || !b.enabled) throw new Error('不能建造：' + id);
  st.stones -= b.cost;
  const def = c.abode.buildings[id];
  if(!b.level && def.needItem) addItem(c, st, def.needItem, -1, []);
  st.abode!.buildings[id] = b.level + 1;
  if(id === 'lingtian' && st.abode!.fieldReady === null) st.abode!.fieldReady = st.actions + c.abode.growActions;
  return st;
}

/** 扩建：第 4–6 格 200×，第 7–9 格 800× */
export function expandCost(c: Content, st: RunState): number | null {
  const i = (st.abode?.slots ?? 0) - c.abode.baseSlots;
  return st.abode && i < c.abode.expand.length ? Math.round(c.abode.expand[i] * stoneCoef(c, st)) : null;
}
export function expand(c: Content, st0: RunState): RunState {
  const st = structuredClone(st0);
  const cost = expandCost(c, st);
  if(cost === null || st.stones < cost || st.location !== 'abode') throw new Error('不能扩建');
  st.stones -= cost; st.abode!.slots++;
  return st;
}

/** 在集市买下一座洞府（500×） */
export function buyAbode(c: Content, st0: RunState): RunState {
  const st = structuredClone(st0);
  const cost = Math.round(c.abode.price * stoneCoef(c, st));
  if(st.abode || st.location !== 'market' || st.stones < cost) throw new Error('不能买洞府');
  st.stones -= cost;
  grantAbode(c, st, [], `在青石坊市买下了一座洞府`);
  return st;
}
