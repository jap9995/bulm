// 数值计算：境界、战力、修为、寿元、耗时、修正合并
// 出处：systems 1.2（主表）、1.5（突破）、1.6（战力）；misc-rules 6.2（修为）、6.5（时间）
import type { Content, Mods, RunState } from './types.ts';

/** 合并出身、天赋、已学功法、已装备物品的修正：数值相加（乘数相乘），布尔取或 */
export function mods(c: Content, st: RunState): Required<Pick<Mods, 'cultAdd' | 'lifespan' | 'powerAdd' | 'fightAdd' | 'fleeAdd' | 'talkAdd' | 'itemDuelAdd' | 'injuryReduce' | 'fortuneOption' | 'marketSlots' | 'rareSlot' | 'npcAff'>> & Mods {
  const list: Mods[] = [];
  const o = c.origins.find(x => x.id === st.origin); if(o?.mods) list.push(o.mods);
  for(const t of st.talents){ const d = c.talents.find(x => x.id === t); if(d?.mods) list.push(d.mods); }
  for(const slot of ['weapon', 'armor', 'accessory'] as const){ const id = st.equip[slot]; const it = id && c.items[id]; if(it && it.mods) list.push(it.mods); }
  // 功法：同一类（school）只取加成最高的一本（systems 2.1「同类取最高」）
  const best: Record<string, Mods> = {};
  for(const id of st.techniques){ const t = c.techniques[id]; if(!t?.mods) continue; const prev = best[t.school]; if(!prev || (t.mods.cultAdd ?? 0) + (t.mods.powerAdd ?? 0) > (prev.cultAdd ?? 0) + (prev.powerAdd ?? 0)) best[t.school] = t.mods; }
  list.push(...Object.values(best));
  for(const w of st.world){ if(w.id === 'omen') list.push({ cultAdd: 0.2 }); if(w.id === 'tide_high') list.push({ cultAdd: 0.5 }); }

  const out: any = { cultAdd: 0, lifespan: 0, powerAdd: 0, fightAdd: 0, fleeAdd: 0, talkAdd: 0, itemDuelAdd: 0, injuryReduce: 0, fortuneOption: 0, marketSlots: 0, rareSlot: 0, npcAff: 0, dangerMult: 1, buyMult: 1, sellMult: 1, timeMult: 1, learnMult: 1, heartDemonMult: 1 };
  for(const m of list){
    for(const [k, v] of Object.entries(m)){
      if(typeof v === 'boolean'){ out[k] = out[k] || v; continue; }
      if(k.endsWith('Mult')){ out[k] = k === 'learnMult' ? Math.min(out[k], v) : out[k] * v; continue; }   // 学习时间减半不叠加（misc-rules 6.5）
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export const realmOf = (c: Content, st: RunState) => c.realms[st.realm];

/** 小层级名：炼气一层……九层；其余初期、中期、后期、圆满 */
export function layerName(c: Content, st: RunState): string {
  const r = realmOf(c, st);
  if(st.realm === 0) return `${r.name}${'一二三四五六七八九'[st.layer - 1]}层`;
  return r.name + ['初期', '中期', '后期', '圆满'][st.layer - 1];
}

export const atRealmPeak = (c: Content, st: RunState) => st.layer >= realmOf(c, st).layers && st.cult >= 1;

/** 境界战力基数（systems 1.2）：炼气 10、每层 +2；筑基 40、每层 +4…… */
export const basePower = (c: Content, realm: number, layer: number) => c.realms[realm].powerBase + c.realms[realm].powerStep * (layer - 1);

/** 战力 = 基数 ×（1 + 各项加成）× 状态系数（systems 1.6） */
export function power(c: Content, st: RunState): number {
  const m = mods(c, st);
  let coef = 1;
  if(st.status.light > 0) coef *= 0.8;
  if(st.status.heavy > 0) coef *= 0.5;
  if(st.status.poison) coef *= 0.7;
  return basePower(c, st.realm, st.layer) * (1 + m.powerAdd) * coef;
}

/** 对手战力（systems 1.6 对手表） */
export function enemyPower(c: Content, st: RunState, strength: string, roll: number): number {
  const r = st.realm, L = st.layer, last = c.realms.length - 1;
  switch(strength){
    case 'lower_realm': return r === 0 ? basePower(c, 0, Math.max(1, L - 3)) : basePower(c, r - 1, c.realms[r - 1].layers);
    case 'same': return basePower(c, r, L) * (0.9 + roll * 0.2);
    case 'higher_layer': return L < c.realms[r].layers ? basePower(c, r, L + 1) : basePower(c, Math.min(last, r + 1), 1);
    case 'higher_realm': return basePower(c, Math.min(last, r + 1), 1);
    case 'higher_two': return basePower(c, Math.min(last, r + 2), 1);
  }
  return basePower(c, r, L);
}

/** 斗法胜率 = 50% + (我 - 敌) / 敌 × 50%，限定 5%–95%（content-expansion 0.2） */
export const duelP = (me: number, foe: number, bonus = 0) => clamp(0.5 + (me - foe) / foe * 0.5 + bonus, 0.05, 0.95);

/** 一次普通修炼获得的修为（misc-rules 6.2：加成相加、惩罚相乘） */
export function cultGain(c: Content, st: RunState, base: number, extraAdd = 0): number {
  const m = mods(c, st);
  let pen = 1;
  if(st.status.heavy > 0) pen *= 0.5;
  if(st.foundation < 30) pen *= 0.8;
  if(st.tox >= 5) pen *= 0.8;
  if(st.world.some(w => w.id === 'tide_low')) pen *= 0.7;
  return base * (1 + m.cultAdd + extraAdd) * pen;
}

export const perLayerGain = (c: Content, st: RunState) => 1 / realmOf(c, st).perLayer;

/** 寿元上限：炼气期 = 出身寿元 + 加成；之后 = 境界上限 +（出身寿元 - 80）+ 加成（systems 1.2） */
export function lifespan(c: Content, st: RunState): number {
  const o = c.origins.find(x => x.id === st.origin)!;
  const r = realmOf(c, st);
  const bonus = st.lifeBonus + mods(c, st).lifespan;
  return (r.lifespan === null ? o.lifespan : r.lifespan + (o.lifespan - 80)) + bonus;
}

export const lifeLeft = (c: Content, st: RunState) => lifespan(c, st) - st.age;

/** 行动耗时（年）= 写明的炼气期年数 × 时间系数 × 时间修正 */
export const years = (c: Content, st: RunState, base: number) => base * realmOf(c, st).timeCoef * (mods(c, st).timeMult ?? 1);

export const stoneCoef = (c: Content, st: RunState) => realmOf(c, st).stoneCoef;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
