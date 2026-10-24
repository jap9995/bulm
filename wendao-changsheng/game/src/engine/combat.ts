// 斗法：一次选择，四档结算，文字由「起、交锋、结果、余韵」拼接
// 规则：content-expansion 0.5；文字：combat-texts 第一节；减免顺序：misc-rules 6.3
import type { Approach, CombatText, Content, DuelTier, Enemy, Frag, RunState, Branch } from './types.ts';
import { duelP, enemyPower, mods, power, clamp } from './calc.ts';
import { rand, chance, weighted } from './rng.ts';
import { apply, addItem, count, fill, setStatus } from './effects.ts';

export interface DuelOutcome { tier: DuelTier | 'escaped'; text: string; lines: string[] }

/** 可重复妖兽（W01）：按当前地点从带 locations 的斗法文字中抽一种 */
export function pickBeast(c: Content, st: RunState): CombatText | undefined {
  const pool = Object.values(c.combat).filter(t => t.locations?.includes(st.location) || (t.locations?.includes('secret') && !!c.locations[st.location]?.secret));
  return weighted(st, 'event', pool.map(v => ({ value: v, w: 1 })));
}

/** 借助道具：背包里加成最高的一张符箓 */
export function bestCharm(c: Content, st: RunState): string | undefined {
  return Object.keys(st.bag).filter(id => c.items[id]?.kind === 'charm' && (c.items[id].duel ?? 0) > 0 && st.bag[id] > 0)
    .sort((a, b) => (c.items[b].duel ?? 0) - (c.items[a].duel ?? 0))[0];
}
/** 施展功法：已学功法里斗法加成最高的一本 */
export function bestTechnique(c: Content, st: RunState) {
  return st.techniques.map(id => c.techniques[id]).filter(t => t && (t.duelAdd ?? 0) > 0).sort((a, b) => (b.duelAdd ?? 0) - (a.duelAdd ?? 0))[0];
}

export function approachAvailable(c: Content, st: RunState, a: Approach): string | null {
  if(a === 'item' && !bestCharm(c, st)) return '身上没有可用的符箓';
  if(a === 'technique' && !bestTechnique(c, st)) return '还没有可用于斗法的功法';
  return null;
}

/** 胜率预估，给选项说明用（「每个选项必须说明玩家大致能获得什么」） */
export function estimate(c: Content, st: RunState, enemy: Enemy, a: Approach, bonus = 0, combat?: CombatText): number {
  return probFor(c, st, enemy, a, bonus, combat, 0.5);
}

function probFor(c: Content, st: RunState, enemy: Enemy, a: Approach, bonus: number, combat: CombatText | undefined, roll: number, two = false): number {
  const m = mods(c, st);
  const cnt = two ? 2 : (enemy.count ?? 1);
  const foe = enemyPower(c, st, enemy.strength, roll) * (cnt === 3 ? 2 : cnt === 2 ? 1.5 : 1);
  const me = power(c, st);
  const tr = combat?.traits ?? {};
  switch(a){
    case 'fight': return duelP(me, foe, m.fightAdd + bonus + (tr.thickHide ? -0.1 : 0));
    case 'technique': return duelP(me, foe, (bestTechnique(c, st)?.duelAdd ?? 0) + bonus);
    case 'item': { const ch = bestCharm(c, st); return duelP(me, foe, (ch ? c.items[ch].duel ?? 0 : 0) + m.itemDuelAdd + bonus); }
    case 'env': return clamp(0.4 + (st.mood - 60) / 200 + (m.envAdd ?? 0) + bonus + (tr.thickHide ? 0.1 : 0), 0.05, 0.95);   // 心境判定，基础 40%
    case 'talk': return clamp(0.5 + m.talkAdd + bonus, 0.05, 0.95);
    case 'flee': return tr.swift ? 1 : clamp(0.6 + m.fleeAdd + bonus, 0.05, 0.95);
  }
}

/** 结算一场斗法：掷档位 → 减免 → 收益与伤势 → 拼文字 */
export function duel(c: Content, st: RunState, enemy: Enemy, a: Approach, bonus: number, tiers: Partial<Record<DuelTier, Branch>> | undefined, combat: CombatText | undefined, location: string): DuelOutcome {
  const lines: string[] = [];
  const m = mods(c, st);
  const tr = combat?.traits ?? {};
  const two = !!tr.pack && chance(st, 'check', tr.pack);
  const p = probFor(c, st, enemy, a, bonus, combat, rand(st, 'check'), two);

  // 借助道具：判定前消耗符箓
  let charmName = '';
  if(a === 'item'){ const ch = bestCharm(c, st); if(ch){ charmName = c.items[ch].name; addItem(c, st, ch, -1, lines); } }
  if(a !== 'flee' && a !== 'talk') st.stats.duels++;

  const vars = textVars(c, st, combat, charmName);
  const tags = ctxTags(c, st, enemy, two, location);
  const parts: string[] = [];
  const open = pickFrag(c, st, combat?.open, tags); if(open) parts.push(open);

  // 逃跑：成功直接脱身；失败按「落败」结算（content-expansion 0.5）
  if(a === 'flee'){
    if(rand(st, 'check') < p){
      const t = pickFrag(c, st, combat?.flee?.ok, tags) ?? '你看准空隙，转身就走，总算脱了身。';
      return { tier: 'escaped', text: fill(st, [...parts, t].join(''), vars), lines };
    }
    parts.push(pickFrag(c, st, combat?.flee?.fail, tags) ?? '你刚转身，背后便挨了一下。');
    return settle(c, st, 'lose', tiers, combat, parts, vars, lines, tags, true);
  }

  // 交涉：成功不战而退；失败按「落败」结算（content-expansion 0.5「交涉 / 破财消灾」）
  if(a === 'talk'){
    if(rand(st, 'check') < p){
      const t = pickFrag(c, st, combat?.talk?.ok, tags) ?? '你好说歹说，对方总算松了口，侧身让开了路。';
      return { tier: 'escaped', text: fill(st, [...parts, t].join(''), vars), lines };
    }
    parts.push(pickFrag(c, st, combat?.talk?.fail, tags) ?? '对方根本不听你说什么，直接动了手。');
    return settle(c, st, 'lose', tiers, combat, parts, vars, lines, tags, true);
  }

  const clash = pickFrag(c, st, combat?.clash[a] ?? combat?.clash.fight, tags); if(clash) parts.push(clash);
  const d = rand(st, 'check');
  let tier: DuelTier = d < p * 0.5 ? 'big' : d < p ? 'win' : d < p + (1 - p) * 0.6 ? 'lose' : 'bad';
  if(tr.brute && tier === 'lose' && chance(st, 'check', 0.25)) tier = 'bad';

  // 档位降级：金刚不坏体（每个大境界一次）→ 玄龟甲（每局 3 次）（misc-rules 6.3 第 1 步）
  if(tier === 'bad'){
    if(st.techniques.includes('jingang_buhuai') && st.flags.jingang_realm !== st.realm){ st.flags.jingang_realm = st.realm; tier = 'lose'; lines.push('金刚不坏体护住了你的要害。'); }
    else if(st.equip.armor === 'xuangui_jia' && (Number(st.flags.xuangui_used ?? 0) < 3)){ st.flags.xuangui_used = Number(st.flags.xuangui_used ?? 0) + 1; tier = 'lose'; lines.push('玄龟甲替你挡下了致命的一击。'); }
  }
  return settle(c, st, tier, tiers, combat, parts, vars, lines, tags, false, m.injuryReduce, enemy);
}

function settle(c: Content, st: RunState, tier: DuelTier, tiers: Partial<Record<DuelTier, Branch>> | undefined, combat: CombatText | undefined, parts: string[], vars: Record<string, string>, lines: string[], tags: Set<string>, fled: boolean, injuryReduce = 0, enemy?: Enemy): DuelOutcome {
  if(!fled) parts.push(pickFrag(c, st, combat?.result[tier], tags) ?? DEFAULT_RESULT[tier]);
  const won = tier === 'big' || tier === 'win';
  if(chance(st, 'text', 0.5)){ const af = pickFrag(c, st, won ? combat?.after.win : combat?.after.lose, tags); if(af) parts.push(af); }

  // 收益：大胜、险胜拿全部收益；大胜 30% 额外战利品（再结算一次险胜的收益）
  if(won){
    st.stats.duelWins++;
    if(enemy?.kind === 'beast' || enemy?.kind === 'cultivator') st.stats.kills++;
    apply(c, st, (tiers?.[tier] ?? tiers?.win)?.effects, lines);
    if(tier === 'big' && chance(st, 'loot', 0.3)){ lines.push('还有意外的收获。'); apply(c, st, tiers?.win?.effects, lines); }
  } else apply(c, st, tiers?.[tier]?.effects, lines);

  // 伤势（misc-rules 6.3 第 2、3 步）
  if(tier === 'win' && !chance(st, 'check', clamp(injuryReduce, 0, 0.9))) setStatus(c, st, 'light', lines);
  if(tier === 'lose'){
    setStatus(c, st, 'light', lines);
    if(chance(st, 'loot', 0.5)) apply(c, st, [{ stonesPct: -0.1 }], lines); else apply(c, st, [{ loseRandomItem: 1 }], lines);
  }
  if(tier === 'bad') setStatus(c, st, 'heavy', lines);
  if(combat?.traits?.venom && (tier === 'lose' || tier === 'bad') && chance(st, 'check', 0.5)) setStatus(c, st, 'poison', lines);
  return { tier, text: fill(st, parts.join(''), vars), lines };
}

const DEFAULT_RESULT: Record<DuelTier, string> = {
  big: '你一击得手，对方再没能站起来。',
  win: '一番缠斗之后，你终于占了上风，自己也挂了彩。',
  lose: '你不是对手，只得且战且退，狼狈脱身。',
  bad: '眼前一黑，等你醒来，浑身像散了架一样。',
};

function textVars(c: Content, st: RunState, combat: CombatText | undefined, charm: string): Record<string, string> {
  const w = st.equip.weapon ? c.items[st.equip.weapon]?.name : '';
  const t = bestTechnique(c, st);
  return { 武器: w || '双拳', 招式: t ? `「${t.moves[0]}」` : '一记掌风', 符箓: charm || '符箓', 敌人: combat?.enemy ?? '对手', 地点: c.locations[st.location]?.name ?? '' };
}

function ctxTags(c: Content, st: RunState, enemy: Enemy, two: boolean, location: string): Set<string> {
  const s = new Set<string>();
  if(two || (enemy.count ?? 1) > 1) s.add('两只');
  if(st.status.light > 0) s.add('轻伤');
  if(st.flags.daoPartner) s.add('道侣');
  if(st.status.heavy > 0) s.add('重伤');
  if(st.flags.moon) s.add('月圆');
  if(st.dao <= -30) s.add('魔');
  if(['higher_layer', 'higher_realm', 'higher_two'].includes(enemy.strength)) s.add('越阶');
  if(enemy.strength === 'lower_realm') s.add('碾压');
  const w = st.equip.weapon ? c.items[st.equip.weapon] : undefined;
  s.add(!w ? '无武器' : w.tags?.includes('sword') ? '剑' : w.tags?.includes('blade') ? '刀' : '拳');
  if(!w) s.add('拳');
  for(const t of st.talents){ const d = c.talents.find(x => x.id === t); if(d) s.add(d.name); }
  const loc = c.locations[location]; if(loc) s.add(loc.name);
  return s;
}

/** 片段选择：带条件标签且满足的 ×3，不满足的不选，普通片段 ×1（combat-texts 1.2） */
function pickFrag(c: Content, st: RunState, frags: Frag[] | undefined, tags: Set<string>): string | undefined {
  if(!frags?.length) return undefined;
  const only = frags.filter(f => typeof f !== 'string' && f.only && f.tags.every(t => tags.has(t)));
  if(only.length) frags = only;
  const items = frags.map(f => typeof f === 'string' ? { value: f, w: 1 } : { value: f.text, w: f.tags.every(t => tags.has(t)) ? 3 : 0 });
  return weighted(st, 'text', items);
}

export { count };
