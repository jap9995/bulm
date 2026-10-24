// NPC：在场判定、好感上限、阶段事件、拜访时的日常互动（叙话、送礼、专属往来）
// 规则：design/npc-daily.md；关系线：content-expansion 第四节
import type { Content, Item, NpcDef, PendingOption, RunState } from './types.ts';
import { addItem, checkAll, setStatus } from './effects.ts';
import { duelP, enemyPower, power, stoneCoef } from './calc.ts';
import { chance, pick, rand } from './rng.ts';
import { preCategory } from './draw.ts';

const DAILY_CAP = 60;   // 日常互动只能把好感推到 60（npc-daily 7.1）
const GRADES = ['yellow', 'mystic', 'earth', 'heaven'];
const CAT_NAME: Record<string, string> = { fortune: '机缘', danger: '危险', resource: '资源', encounter: '人物', moral: '抉择' };

/** 好感上限：林小婉「银货两讫」50、太上忘情 50（npc-daily 7.2） */
export function affCap(st: RunState, id: string): number {
  let cap = st.flags['affCap_' + id] !== undefined ? Number(st.flags['affCap_' + id]) : 100;
  if(id === 'lin_xiaowan' && st.flags.linTrade) cap = Math.min(cap, 50);
  if(st.talents.includes('E04')) cap = Math.min(cap, 50);
  return cap;
}

/** 改变好感；daily 为日常互动（受 60 的上限）。随后检查阶段事件 */
export function addAff(c: Content, st: RunState, id: string, add: number, daily = false): void {
  const n = (st.npcs[id] ??= { aff: 0, met: true });
  if(add > 0){
    const cap = Math.min(affCap(st, id), daily ? DAILY_CAP : 100);
    if(n.aff < cap) n.aff = Math.min(cap, n.aff + add);
  } else n.aff = Math.max(-100, n.aff + add);
  stages(c, st, id);
}

/** 好感跨过 30 / 60 门槛后，阶段事件进入剧情位，在这位 NPC 出没的地点等你（event-draw 2.2） */
export function stages(c: Content, st: RunState, id: string): void {
  const def = c.npcs[id]; const n = st.npcs[id];
  if(!def || !n?.met || n.dead) return;
  for(const [t, ev] of Object.entries(def.stages)){
    if(n.aff >= Number(t) && !st.seen[ev] && !st.ready.some(r => r.event === ev))
      st.ready.push({ event: ev, locations: def.stageAt ?? def.visit, since: st.actions });
  }
}

/** 这位 NPC 此刻在哪里：柳寒衣每 6 次行动换一次地方 */
export function whereIs(c: Content, st: RunState, id: string): string[] {
  const d = c.npcs[id];
  if(!d.wander) return d.visit;
  const k = Math.floor(st.actions / d.wander);
  return [d.visit[(st.seed + k * 7919) % d.visit.length]];
}

/** 此刻能拜访的人（npc-daily 第二节） */
export function presentNpcs(c: Content, st: RunState): string[] {
  return Object.keys(c.npcs).filter(id => {
    const n = st.npcs[id];
    return n?.met && !n.dead && n.aff > -50 && checkAll(c, st, c.npcs[id].visitUnlock) && whereIs(c, st, id).includes(st.location);
  });
}

/** 拜访：有就绪的阶段事件就直接触发；否则打开日常互动 */
export function visitReady(st: RunState, c: Content, id: string): string | undefined {
  const evs = new Set(Object.values(c.npcs[id].stages));
  const r = st.ready.find(x => evs.has(x.event));
  if(!r) return undefined;
  st.ready.splice(st.ready.indexOf(r), 1);
  return r.event;
}

export function openVisit(c: Content, st: RunState, id: string): void {
  const d = c.npcs[id];
  st.flags.__visit = id;
  const sp = specialOption(c, st, id);
  const opts: PendingOption[] = [
    { index: 0, text: '叙话', hint: '聊几句，好感小幅上升；也许能听到有用的消息', enabled: true },
    { index: 1, text: '送礼', hint: '送一件背包里的东西', enabled: giftList(c, st).length > 0, reason: giftList(c, st).length ? undefined : '背包里没有能送的东西' },
  ];
  if(sp) opts.push({ index: 2, ...sp });
  opts.push({ index: 3, text: '告辞', hint: '什么也不做', enabled: true });
  st.pending = { event: '__visit', text: `你去见了${d.name}。`, options: opts, source: 'story' };
}

// ───────────── 送礼（npc-daily 第五节） ─────────────

export function giftList(c: Content, st: RunState): string[] {
  return Object.keys(st.bag).filter(id => st.bag[id] > 0 && c.items[id]).sort();
}

function matches(it: Item, rule: string): boolean {
  return rule.split('&').every(r => {
    const [k, v] = r.includes(':') ? r.split(':') : ['id', r];
    switch(k){
      case 'id': return it.id === v;
      case 'tag': return !!it.tags?.includes(v);
      case 'kind': return it.kind === v;
      case 'slot': return it.slot === v;
      case 'grade': return GRADES.indexOf(it.grade) >= GRADES.indexOf(v);
      case 'gradeIs': return it.grade === v;
      case 'priceGte': return (it.fixedPrice ?? it.price ?? it.sell ?? 0) >= Number(v);
      case 'priceLt': return (it.fixedPrice ?? it.price ?? it.sell ?? 0) < Number(v);
    }
    return false;
  });
}

export function taste(c: Content, npc: string, item: string): 'favorite' | 'like' | 'dislike' | 'plain' {
  const g = c.npcs[npc].gifts, it = c.items[item];
  if(g.favorite.some(r => matches(it, r))) return 'favorite';
  if(g.dislike.some(r => matches(it, r))) return 'dislike';
  if(g.like.some(r => matches(it, r))) return 'like';
  return 'plain';
}

export function openGift(c: Content, st: RunState): void {
  const list = giftList(c, st);
  st.pending = { event: '__gift', text: '送点什么？', source: 'story', options: [
    ...list.map((id, i) => ({ index: i, text: c.items[id].name, hint: `背包里有 ${st.bag[id]} 件`, enabled: true })),
    { index: -2, text: '算了', hint: '不送了', enabled: true },
  ] };
}

export function giveGift(c: Content, st: RunState, item: string, out: string[]): void {
  const id = String(st.flags.__visit), d = c.npcs[id];
  addItem(c, st, item, -1, out);
  const since = st.actions - Number(st.flags['giftAt_' + id] ?? -99);
  st.flags['giftAt_' + id] = st.actions;
  if(id === 'xiao_shitou' && ['technique', 'pill'].includes(c.items[item].kind)) st.flags.shitouNurture = Number(st.flags.shitouNurture ?? 0) + 1;
  if(since < 3){ out.push(`${d.name}收下了，笑着说：「你上回送的还没用完呢。」`); return; }
  const t = taste(c, id, item);
  let add = 3;
  if(t === 'favorite'){ add = st.flags['favRealm_' + id] === st.realm ? 8 : 15; st.flags['favRealm_' + id] = st.realm; out.push(`${d.name}眼睛一亮。`); }
  if(t === 'like'){ add = 8; out.push(`${d.name}看起来很喜欢。`); }
  if(t === 'dislike'){
    const twice = !!st.flags['disliked_' + id]; st.flags['disliked_' + id] = true;
    add = (id === 'a_jiu' && c.items[item].tags?.includes('beast')) ? -15 : twice ? -10 : -5;
    out.push(`${d.name}的脸色沉了下来。`);
  }
  if(t === 'plain') out.push(`${d.name}道了声谢，收下了。`);
  addAff(c, st, id, add, true);
}

// ───────────── 叙话（npc-daily 第四节） ─────────────

export function chat(c: Content, st: RunState, out: string[]): void {
  const id = String(st.flags.__visit), d = c.npcs[id];
  const since = st.actions - Number(st.flags['chatAt_' + id] ?? -99);
  st.flags['chatAt_' + id] = st.actions;
  let add = since >= 4 ? 3 : 1;
  const far = (d.stance === 'righteous' && st.dao <= -30) || (d.stance === 'demonic' && st.dao >= 50);
  if(far) add = Math.floor(add / 2);
  out.push(since >= 4 ? `你和${d.name}聊了一阵。` : `「你怎么又来了？」${d.name}嘴上这么说，还是陪你坐了一会儿。`);
  if(id === 'xiao_shitou') st.flags.shitouCompany = Number(st.flags.shitouCompany ?? 0) + 1;
  if(chance(st, 'event', 0.3) && d.gossip.length){
    const g = pick(st, 'text', d.gossip);
    out.push(g.text);
    if(g.type === 'item' && g.item) addItem(c, st, g.item, 1, out);
    if(g.type === 'heart'){ add += 2; st.log.push({ age: Math.floor(st.age), type: 'npc', weight: 2, text: `听${d.name}讲起往事` }); }
    if(g.type === 'hint'){ const loc = c.locations[st.location]?.explore ? st.location : 'wilds'; const cat = preCategory(c, st, loc); if(cat) out.push(`（下一次在${c.locations[loc].name}外出探索，会遇到${CAT_NAME[cat] ?? cat}。）`); }
  }
  addAff(c, st, id, add, true);
}

// ───────────── 专属往来（npc-daily 第六节） ─────────────

function specialOption(c: Content, st: RunState, id: string): Omit<PendingOption, 'index'> | null {
  const d = c.npcs[id], sp = d.special; if(!sp) return null;
  if(sp.unlock && !checkAll(c, st, sp.unlock)) return null;
  const coef = stoneCoef(c, st);
  switch(sp.type){
    case 'spar': {
      const wait = Number(st.flags['sparAt_' + id] ?? -99) + (sp.gap ?? 4) - st.actions;
      return { text: '切磋', hint: `点到为止，不会受伤。胜了好感 +${sp.win}、修为 +5%`, enabled: wait <= 0, reason: wait > 0 ? `${wait} 次行动后才能再切磋` : undefined };
    }
    case 'heal': {
      const c0 = healCost(st); const half = st.flags.baiMaster ? 0.5 : 1;
      if(!c0) return { text: '问诊', hint: '你没有伤病', enabled: false, reason: '你没有伤病' };
      const cost = Math.round(c0.cost * coef * half);
      return { text: '问诊', hint: `治好${c0.name}：${cost} 灵石`, enabled: st.stones >= cost, reason: st.stones >= cost ? undefined : '灵石不足' };
    }
    case 'intel': { const cost = Math.round((sp.cost ?? 20) * coef); return { text: '买情报', hint: `${cost} 灵石：打听下一次外出探索会遇到什么`, enabled: st.stones >= cost, reason: st.stones >= cost ? undefined : '灵石不足' }; }
    case 'cocultivate': return { text: '同修', hint: '一起打坐：心境 +5', enabled: true };
    case 'teach': {
      const key = st.realm * 10 + st.layer;
      return { text: '请教', hint: `修为 +${st.npcs[id].aff >= 30 ? 15 : 10}%；每个小层级只能请教一次`, enabled: st.flags.taughtAt !== key, reason: st.flags.taughtAt === key ? '这一层已经请教过了' : undefined };
    }
  }
  return null;
}

const healCost = (st: RunState) => st.status.heavy > 0 ? { name: '重伤', cost: 50, k: 'heavy' } : st.status.poison ? { name: '中毒', cost: 15, k: 'poison' } : st.status.light > 0 ? { name: '轻伤', cost: 10, k: 'light' } : null;

export function special(c: Content, st: RunState, out: string[]): void {
  const id = String(st.flags.__visit), d = c.npcs[id], sp = d.special!;
  const coef = stoneCoef(c, st);
  switch(sp.type){
    case 'spar': {
      st.flags['sparAt_' + id] = st.actions;
      const p = duelP(power(c, st), enemyPower(c, st, sp.strength ?? 'same', rand(st, 'check')));
      if(rand(st, 'check') < p){ out.push(`你们比了几十招，最后是你的剑先停在了${d.name}的喉前。`); st.cult += 0.05; out.push('修为 +5%。'); addAff(c, st, id, sp.win ?? 3, true); }
      else { out.push(`${d.name}的剑点在你的肩头：「再来。」`); addAff(c, st, id, sp.lose ?? 1, true); }
      return;
    }
    case 'heal': {
      const h = healCost(st)!;
      st.stones -= Math.round(h.cost * coef * (st.flags.baiMaster ? 0.5 : 1));
      if(h.k === 'heavy') st.status.heavy = 0; else if(h.k === 'poison') st.status.poison = false; else st.status.light = 0;
      out.push(`${d.name}替你施了针，又开了一副药。${h.name}好了。`);
      return;
    }
    case 'intel': {
      st.stones -= Math.round((sp.cost ?? 20) * coef);
      const loc = c.locations[st.location]?.explore ? st.location : 'wilds';
      const cat = preCategory(c, st, loc);
      out.push(`${d.name}凑过来，压低声音说了几句。`, `（下一次在${c.locations[loc].name}外出探索，会遇到${CAT_NAME[cat ?? ''] ?? '平静'}。）`);
      return;
    }
    case 'cocultivate': st.mood += 5; out.push(`你和${d.name}对坐了一夜。心境 +5。`); addAff(c, st, id, 2, true); return;
    case 'teach': {
      st.flags.taughtAt = st.realm * 10 + st.layer;
      const g = st.npcs[id].aff >= 30 ? 0.15 : 0.1;
      st.cult += g; out.push(`${d.name}点拨了你几句。修为 +${Math.round(g * 100)}%。`);
      addAff(c, st, id, 1, true);
      return;
    }
  }
  void setStatus;
}

export type { NpcDef };
