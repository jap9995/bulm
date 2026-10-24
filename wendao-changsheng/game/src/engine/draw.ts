// 事件抽取：强制队列 → 剧情位 → 类别 → 具体事件 → 机缘选项；行动结束后判定特殊事件
// 规则全部来自 design/event-draw.md，注释里的节号指那份文档
import type { Category, Content, EventDef, RunState, SpecialDef, Tier } from './types.ts';
import { checkAll } from './effects.ts';
import { chance, rand, weighted } from './rng.ts';
import { mods } from './calc.ts';

const TIER_W: Record<Tier, number> = { common: 10, uncommon: 5, rare: 2, legendary: 1 };   // 3.3
const DRAWN: Category[] = ['fortune', 'danger', 'resource', 'encounter', 'moral'];

const locMatch = (c: Content, ev: EventDef, loc: string) =>
  ev.locations.includes(loc)
  || (ev.locations.includes('secret') && c.locations[loc]?.id.startsWith('secret'))
  || (ev.locations.includes('explore') && !!c.locations[loc]?.explore)
  || (ev.locations.includes('any') && (!!c.locations[loc]?.explore || loc === 'market'));

/** 这个事件此刻能不能进入候选（3.3） */
export function eligible(c: Content, st: RunState, ev: EventDef, loc: string): boolean {
  if(ev.chainOnly) return false;
  if(!locMatch(c, ev, loc)) return false;
  const n = st.seen[ev.id] ?? 0;
  if(n > 0 && !ev.repeatable) return false;
  if(n > 0 && st.stats.events - (st.lastSeen[ev.id] ?? -99) <= Math.max(2, ev.cooldown ?? 0)) return false;   // 可重复事件的冷却
  return checkAll(c, st, ev.unlock) && checkAll(c, st, ev.conditions);
}

/** 强制队列：到期的按优先级弹出一个（2.1） */
export function popForced(st: RunState): string | undefined {
  const due = st.queue.filter(q => q.due <= st.actions).sort((a, b) => a.prio - b.prio || a.due - b.due);
  if(!due.length) return undefined;
  st.queue.splice(st.queue.indexOf(due[0]), 1);
  return due[0].event;
}

/** 剧情位（2.2）：拜访人物时 100%；其他行动按等待时长 30% / 50% / 100% */
export function popStory(c: Content, st: RunState, loc: string, visit = false): string | undefined {
  const here = st.ready.filter(r => r.locations.includes(loc) || r.locations.includes('any'));
  if(!here.length) return undefined;
  const r = here.sort((a, b) => a.since - b.since)[0];
  const wait = st.actions - r.since;
  const p = visit || wait >= 6 ? 1 : wait >= 3 ? 0.5 : 0.3;
  if(!chance(st, 'event', p)) return undefined;
  st.ready.splice(st.ready.indexOf(r), 1);
  return r.event;
}

/** 类别权重（3.1 地点表 × 3.2 修正 × 3.4 连续性控制） */
function categoryWeights(c: Content, st: RunState, loc: string): Partial<Record<Category, number>> {
  const base = c.locations[loc]?.categories ?? {};
  const m = mods(c, st);
  const out: Partial<Record<Category, number>> = {};
  for(const k of DRAWN){
    const b = base[k] ?? 0; if(!b) continue;
    let w = b;
    if(k === 'fortune'){ w *= Math.max(0.75, 1 + (st.luck - 10) / 40); if(st.world.some(x => x.id === 'omen')) w *= 1.5; if(st.sinceFortune >= 8) w *= 2; }
    if(k === 'danger'){
      w *= m.dangerMult ?? 1;
      if(st.world.some(x => x.id === 'demon_war')) w *= 2;
      if(st.actions < 10) w *= 0.6;                                         // 新手保护
      if(st.recent.slice(-2).length === 2 && st.recent.slice(-2).every(x => x === 'danger')) w *= 0.4;
      if(st.flags.justHealed){ w *= 0.5; }
    }
    if(st.recent.length >= 3 && st.recent.slice(-3).every(x => x === k)) w *= 0.5;
    out[k] = Math.max(w, b * 0.3);                                          // 最低不低于原值的 0.3 倍
  }
  return out;
}

/** 预抽类别（4.1）：到了探索地点就抽好并保留，直到真的探索 */
export function preCategory(c: Content, st: RunState, loc: string): Category | undefined {
  if(!c.locations[loc]?.explore) return undefined;
  if(!st.preCategory[loc]){
    const w = categoryWeights(c, st, loc);
    const cat = weighted(st, 'event', Object.entries(w).map(([k, v]) => ({ value: k as Category, w: v! })));
    if(cat) st.preCategory[loc] = cat;
  }
  return st.preCategory[loc];
}

function eventWeight(c: Content, st: RunState, ev: EventDef): number {
  let w = TIER_W[ev.tier];
  const tags = ev.tags ?? [];
  if(tags.includes('commoner') && st.origin === 'orphan') w *= 2;
  if(tags.includes('sect') && st.origin === 'outcast') w *= 1.5;
  if(tags.includes('sword') && st.talents.includes('R03')) w *= 2;
  if(tags.includes('yin') && st.talents.includes('R06')) w *= 1.2;
  if(tags.includes('yin') && ev.id === 'J12' && !st.talents.includes('R06')) w *= 0.3;
  if(tags.includes('demonic') && st.dao <= -30) w *= 1.5;
  if(tags.includes('first_meet') && st.actions - Number(st.flags.lastMeet ?? 0) > 15) w *= 2;
  const n = st.seen[ev.id] ?? 0;
  if(ev.repeatable && n > 0) w *= Math.max(0.3, Math.pow(0.7, n));
  return w;
}

/** 普通抽取（第三节）。返回事件 id；抽空时返回本地点的平静事件 */
export function drawNormal(c: Content, st: RunState, loc: string, forceCat?: Category): string | undefined {
  let weights = categoryWeights(c, st, loc);
  let first: Category | undefined = forceCat ?? (c.locations[loc]?.explore ? preCategory(c, st, loc) : undefined);
  delete st.preCategory[loc];
  for(let tries = 0; tries < 6; tries++){
    const cat = first ?? weighted(st, 'event', Object.entries(weights).map(([k, v]) => ({ value: k as Category, w: v! })));
    first = undefined;
    if(!cat) break;
    const cands = Object.values(c.events).filter(e => e.category === cat && eligible(c, st, e, loc));
    const ev = weighted(st, 'event', cands.map(e => ({ value: e, w: eventWeight(c, st, e) })));
    if(ev){ st.recent = [...st.recent, cat].slice(-5); st.sinceFortune = cat === 'fortune' ? 0 : st.sinceFortune + 1; return ev.id; }
    weights = { ...weights, [cat]: 0 };                                     // 3.5：这一类没有候选，重新抽类别
  }
  const calm = Object.values(c.events).filter(e => e.category === 'calm' && locMatch(c, e, loc));
  const ev = weighted(st, 'event', calm.map(e => ({ value: e, w: 1 })));
  if(ev) st.stats.calm++;
  return ev?.id;
}

/** 机缘选项（第六节）：出现概率 = 气运 × 0.5% + 气运加身 30%，最高 55% */
export function rollFortune(c: Content, st: RunState, ev: EventDef): boolean {
  if(!['fortune', 'danger', 'resource', 'encounter'].includes(ev.category)) return false;
  const p = Math.min(0.55, st.luck * 0.005 + mods(c, st).fortuneOption);
  return chance(st, 'event', p);
}

/** 特殊事件（第七节）：每次行动后 3%（天命异人 6%），冷却 25 次，每局最多 3 个 */
export function rollSpecial(c: Content, st: RunState, firstRun: boolean): SpecialDef | undefined {
  if(st.special.count >= 3 || st.actions < st.special.until) return undefined;
  if(firstRun && st.actions < 15) return undefined;
  const p = st.origin === 'destined' ? 0.06 : 0.03;
  if(rand(st, 'event') >= p) return undefined;
  const cands = c.specials.filter(s => checkAll(c, st, s.conditions) && !(s.once && st.seen[s.id]) && !st.world.some(w => w.id === s.world?.id));
  const s = weighted(st, 'event', cands.map(x => ({ value: x, w: x.weight })));
  if(!s) return undefined;
  st.special.count++; st.special.until = st.actions + 25;
  return s;
}
