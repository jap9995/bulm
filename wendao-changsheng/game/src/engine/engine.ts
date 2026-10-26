// 《问道长生》引擎入口：newRun / actions / act / choose / buy / sell / usePill
// 每个函数都返回新的状态（原状态不变），同一种子、同样的调用序列一定得到同样的结果（systems 13.1、7.3）
import type { Category, Content, EventDef, OptionDef, Pending, PendingOption, RunState, View } from './types.ts';
import { atRealmPeak, clamp, cultGain, layerName, lifeLeft, lifespan, mods, perLayerGain, realmOf, stoneCoef, years } from './calc.ts';
import { addItem, affordable, apply, checkAll, count, fill, passTime, setStatus } from './effects.ts';
import { approachAvailable, duel, estimate, pickBeast } from './combat.ts';
import { arrive } from './sect.ts';
import { advanceDestiny, closeDestiny, startDestiny } from './destiny.ts';
import { chat, giftList, giveGift, openGift, openVisit, presentNpcs, special, visitReady } from './npc.ts';
import { abodeCultAdd, arriveAbode, quietRoom } from './abode.ts';
import { drawNormal, popForced, popStory, preCategory, rollFortune, rollSpecial } from './draw.ts';
import { chance, pick, rand, seedStreams } from './rng.ts';
import { refreshMarket, priceOf, sellPriceOf } from './market.ts';

export interface NewRunOptions { seed: number; origin: string; talent: string; gender?: 'm' | 'f'; name?: string; firstRun?: boolean; destiny?: string }

/** 外出探索的历练修为（当前小层级的比例）：加上事件里写明的修为，平均约 15%（systems 1.4） */
const EXPLORE_CULT = 0.13;
/** 突破材料保底：圆满后缺材料时，每探索这么多次必定出一次「灵物出世」 */
const MATERIAL_PITY = 12;
const ACTION_TIME = { cultivate: 1, push: 1.5, temper: 1, explore: 0.5, move: 0.25, ask: 0.25, village: 0.25, visit: 0.25 };   // systems 1.3

// ───────────── 开局 ─────────────

/** 天赋候选：普通 60%、稀有 30%、史诗 9%、传说 1%（content-expansion 第二节），只从已解锁的里抽 */
export function offerTalents(c: Content, seed: number, n = 3): string[] {
  const st = { rng: seedStreams(seed ^ 0x51ed) } as RunState;
  const out: string[] = [];
  for(let i = 0; i < 40 && out.length < n; i++){
    const r = rand(st, 'loot');
    const rarity = r < 0.6 ? 'common' : r < 0.9 ? 'rare' : r < 0.99 ? 'epic' : 'legend';
    const pool = c.talents.filter(t => t.unlocked && t.rarity === rarity && !out.includes(t.id));
    if(pool.length) out.push(pick(st, 'loot', pool).id);
  }
  return out;
}

export function newRun(c: Content, o: NewRunOptions): RunState {
  const origin = c.origins.find(x => x.id === o.origin); if(!origin) throw new Error('未知出身：' + o.origin);
  const talent = c.talents.find(x => x.id === o.talent); if(!talent) throw new Error('未知天赋：' + o.talent);
  const st: RunState = {
    v: 1, seed: o.seed, rng: seedStreams(o.seed), steps: 0, actions: 0,
    gender: o.gender ?? 'm', name: '', origin: origin.id, talents: [talent.id],
    realm: 0, layer: origin.layer, cult: 0, age: 16, lifeBonus: 0, stones: origin.stones,
    foundation: origin.foundation ?? 50, luck: origin.luck ?? 10, mood: origin.mood ?? 60, dao: origin.dao ?? 0, tox: 0,
    status: { light: 0, heavy: 0, poison: false, heartDemon: false, everHeavy: false },
    bag: {}, keyItems: {}, equip: {}, techniques: [...(origin.techniques ?? [])], location: 'wilds',
    npcs: {}, factions: {}, seen: {}, lastSeen: {}, queue: [], ready: [], flags: { firstRun: !!o.firstRun }, world: [],
    special: { count: 0, until: 0 }, sect: null, abode: null, destiny: null, recent: [], sinceFortune: 0, preCategory: {}, exploreStreak: { loc: '', n: 0 },
    breakCooldown: false, ads: { revive: false, relief: [] }, market: null,
    stats: { duels: 0, duelWins: 0, kills: 0, breakthroughs: 0, breakFails: 0, adsWatched: 0, calm: 0, explores: 0, events: 0 },
    log: [], pending: null, ended: null,
  };
  st.name = o.name ?? pick(st, 'text', c.names.surnames) + pick(st, 'text', c.names.given);
  st.foundation += talent.foundation ?? 0; st.luck += talent.luck ?? 0; st.mood += talent.mood ?? 0;
  const junk: string[] = [];
  for(const [id, n] of Object.entries(origin.items ?? {})) addItem(c, st, id, n, junk);
  for(const id of origin.equip ?? []){ const it = c.items[id]; if(it?.slot) st.equip[it.slot] = id; }
  st.log.push({ age: 16, type: 'start', weight: 100, text: `${origin.name}·${st.name}，十六岁踏入仙途` });
  if(o.destiny) startDestiny(c, st, o.destiny);
  preCategory(c, st, st.location);
  return st;
}

// ───────────── 行动 ─────────────

export interface ActionInfo { id: string; label: string; enabled: boolean; reason?: string; hint?: string }

export function actions(c: Content, st0: RunState): ActionInfo[] {
  const st = st0;
  if(st.ended || st.pending) return [];
  const out: ActionInfo[] = [];
  const loc = c.locations[st.location];
  if(st.location === 'wilds' || st.location === 'valley' || st.location === 'abode'){
    const peak = atRealmPeak(c, st);
    // 突破失败后要先修炼一次才能再突破（systems 1.5）；看广告免罚时修为仍是满的，这时修炼改为调息，否则会两头卡住
    const settle = peak && st.breakCooldown;
    out.push({ id: 'cultivate', label: st.status.heavy > 0 ? '闭关疗伤' : settle ? '调息' : '普通修炼', enabled: !peak || settle, reason: peak && !settle ? '修为已满，需要突破' : undefined, hint: settle ? '平复气息，之后可以再次突破' : undefined });
    out.push({ id: 'push', label: '全力冲关', enabled: !peak && st.status.heavy === 0, hint: '修为更多，可能遭遇心魔或灵气暴走' });
    out.push({ id: 'temper', label: '打磨根基', enabled: true, hint: '修为少，根基 +5' });
  }
  if(loc?.explore){
    const cat = st.preCategory[st.location];   // 只读：预抽在状态变化时完成（见 act、newRun）
    const m = mods(c, st);
    const tag = m.previewCategory && cat ? ` · ${CAT_NAME[cat]}` : m.dangerWarn && cat === 'danger' ? ' · ⚠' : '';
    out.push({ id: 'explore', label: '外出探索' + tag, enabled: !(loc.secret && st.status.heavy > 0), reason: loc.secret && st.status.heavy > 0 ? '重伤时不能在秘境里探索' : undefined });
  }
  for(const id of presentNpcs(c, st)) out.push({ id: 'visit:' + id, label: '拜访' + c.npcs[id].name, enabled: true });
  if(st.location === 'market') out.push({ id: 'ask', label: '打听消息', enabled: true });
  if(st.location === 'village') out.push({ id: 'village', label: '拜访村民', enabled: true });
  if(atRealmPeak(c, st) && st.realm < c.realms.length - 1){
    const next = c.realms[st.realm + 1];
    const has = !next.material || materialCount(c, st, next.material) >= next.materialCount;
    const reason = st.breakCooldown ? '上次突破失败，需要先修炼一次' : undefined;
    // 重伤时突破：失败后果里有重伤的，失败就是再次重伤，即身死道消（misc-rules 6.4）。不拦，但要说清楚
    const deadly = (m: 'normal' | 'forced') => st.status.heavy > 0 && (next.failure?.[m].heavy ?? 0) > 0 ? '你身负重伤，这次失败就会身死道消' : undefined;
    out.push({ id: 'break:normal', label: `突破${next.name}（${pct(breakRate(c, st, 'normal'))}）`, enabled: has && !reason, reason: !has ? `缺少${c.items[next.material!]?.name}` : reason, hint: deadly('normal') });
    if(has && count(st, 'pojing_dan') > 0) out.push({ id: 'break:stable', label: `稳妥突破（${pct(breakRate(c, st, 'stable'))}）`, enabled: !reason, reason, hint: deadly('normal') });
    if(!has) out.push({ id: 'break:forced', label: `强行突破（${pct(breakRate(c, st, 'forced'))}）`, enabled: !reason, reason, hint: deadly('forced') ?? '没有材料，失败后果更重' });
  }
  for(const id of Object.keys(c.locations)){
    if(id === st.location) continue;
    const l = c.locations[id];
    if(!checkAll(c, st, l.unlock)) continue;
    if(l.sect && st.sect && st.sect.id !== l.sect) continue;   // 已入门时，其他宗门不再出现在去处里
    const blocked = l.secret && st.status.heavy > 0;
    out.push({ id: 'move:' + id, label: '前往' + l.name, enabled: !blocked, reason: blocked ? '重伤时不能进入秘境' : undefined });
  }
  for(const id of Object.keys(st.bag)){ const it = c.items[id]; if(it?.kind === 'technique' && !st.techniques.includes(it.technique!)) out.push({ id: 'study:' + id, label: `研习《${it.name}》`, enabled: true, hint: `耗时约 ${studyYears(c, st, id)} 年` }); }
  if(lifeLeft(c, st) < 20 || st.realm >= 3) out.push({ id: 'retire', label: '坐化', enabled: true, hint: '体面地结束这一生' });
  return out;
}

const CAT_NAME: Record<Category, string> = { fortune: '机缘', danger: '危险', resource: '资源', encounter: '人物', moral: '抉择', special: '异象', calm: '平静', seclusion: '闭关', sect: '宗门', abode: '洞府' };
const pct = (p: number) => `${Math.round(p * 100)}%`;

export function act(c: Content, st0: RunState, actionId: string): { state: RunState; view: View } {
  const st = structuredClone(st0);
  const out: string[] = [];
  const info = actions(c, st).find(a => a.id === actionId);
  if(!info || !info.enabled) throw new Error('当前不能执行：' + actionId);
  st.steps++;
  const [kind, arg] = actionId.split(':');
  const loc = c.locations[st.location];
  let eventId: string | undefined;
  let source: Pending['source'] = 'normal';

  if(kind === 'retire'){ endRun(c, st, 'retire'); return { state: st, view: view(st, out) }; }
  if(kind === 'study'){
    passTime(c, st, studyYears(c, st, arg)); st.actions++;
    const it = c.items[arg]; addItem(c, st, arg, -1, out); st.techniques.push(it.technique!);
    out.push(`你闭门研习，终于学会了《${it.name}》。`);
    tick(c, st, out); return { state: st, view: view(st, out) };
  }
  if(kind === 'break'){ breakthrough(c, st, arg as 'normal' | 'stable' | 'forced', out); if(!st.pending) tick(c, st, out); return { state: st, view: view(st, out) }; }

  const baseTime = kind === 'move' ? ACTION_TIME.move : (ACTION_TIME as any)[kind];
  passTime(c, st, years(c, st, baseTime));

  if(kind === 'cultivate' || kind === 'push' || kind === 'temper'){
    const mult = kind === 'push' ? 1.8 : kind === 'temper' ? 0.3 : 1;
    const vein = st.location === 'wilds' && Number(st.flags.veinLeft ?? 0) > 0;
    if(vein) st.flags.veinLeft = Number(st.flags.veinLeft) - 1;
    const g = cultGain(c, st, perLayerGain(c, st) * mult, (vein ? 0.5 : 0) + abodeCultAdd(c, st));
    if(atRealmPeak(c, st)) out.push(st.status.heavy > 0 ? '闭关疗伤，修为已满，没有再涨。' : '你闭目调息，体内翻涌的灵力渐渐平复下来。');
    else { st.cult += g; out.push(`${kind === 'push' ? '全力冲关' : kind === 'temper' ? '打磨根基' : st.status.heavy > 0 ? '闭关疗伤' : '闭关修炼'}，修为 +${Math.round(g * 100)}%。`); }
    if(kind === 'temper'){ st.foundation += 5; out.push('根基 +5。'); }
    if(st.mood < 50){ st.mood = Math.min(50, st.mood + 3); }
    const quiet = quietRoom(st); if(quiet){ st.mood += 5 * quiet; }   // 静室（systems 6.2）                        // 心境回到 50（misc-rules 第二节）
    if(st.tox > 0) st.tox--;
    if(st.status.heavy > 0 && --st.status.heavy === 0){ out.push('重伤痊愈了。'); st.flags.justHealed = true; }
    st.breakCooldown = false;
    // 闭关事件 W05 / W06（event-draw 4.5）
    const m = mods(c, st);
    const demonP = ((kind === 'push' ? 0.15 : 0) + (st.mood < 40 ? 0.25 : 0)) * (m.heartDemonMult ?? 1) * (quiet ? 0.8 : 1);
    if(chance(st, 'event', demonP) && c.events.W05) eventId = 'W05';
    else if(kind === 'push' && !st.world.some(w => w.id === 'tide_high') && chance(st, 'event', 0.2) && c.events.W06) eventId = 'W06';
    // 闭关被打扰（misc-rules 第三节）：野外 10%，洞府 5%，建了护山阵不会遇袭；重伤时遇袭最危险
    else { const p = st.location === 'abode' ? ((st.abode?.buildings.hushan ?? 0) > 0 ? 0 : 0.05) : 0.1; if(chance(st, 'event', p)) eventId = st.status.heavy > 0 ? 'A_ambush_hurt' : 'A_ambush'; }
    if(eventId) source = 'forced';
  }
  if(kind === 'move'){
    if(st.location === 'abode' && st.abode) st.abode.leftAt = st.actions;
    st.location = arg; out.push(`来到了${c.locations[arg].name}。`);
    if(arg === 'market'){ refreshMarket(c, st); st.flags.night = chance(st, 'event', 0.2); }
    if(arg === 'village' && (st.flags.villageOffering || st.flags.shitouSteward) && st.actions - Number(st.flags.offerAt ?? -99) >= 3){
      st.flags.offerAt = st.actions;
      const base = (st.flags.villageOffering ? 10 : 0) + (st.flags.shitouSteward ? 20 : 0);
      st.flags.offerings = Number(st.flags.offerings ?? 0) + base;
      const n = Math.round(base * stoneCoef(c, st)); st.stones += n; out.push(`村里送来了供奉，灵石 +${n}。`);
    }
    if(arg === 'market' && st.flags.stall && st.actions - Number(st.flags.stallAt ?? -99) >= 3){
      st.flags.stallAt = st.actions;
      if(chance(st, 'loot', 0.15)){ delete st.flags.stall; out.push('你入股的那个摊子倒闭了。'); }
      else { const n = Math.round(20 * stoneCoef(c, st)); st.stones += n; out.push(`摊主把这一期的分红交给你，灵石 +${n}。`); }
    }
    if(arg === 'abode'){ eventId = arriveAbode(c, st); if(eventId) source = 'forced'; }
    if(c.locations[arg].sect){ eventId = arrive(c, st, out); if(eventId) source = 'forced'; }   // 回宗必出一个宗门事件（event-draw 4.4）
  }

  st.actions++;
  if(st.status.light > 0 && --st.status.light === 0) out.push('轻伤自愈了。');

  // 拜访人物：有就绪的关系线事件就直接触发，否则进入日常互动（npc-daily 第三节）
  if(kind === 'visit' && !eventId){
    eventId = visitReady(st, c, arg); source = 'story';
    if(!eventId){ openVisit(c, st, arg); return { state: st, view: view(st, out) }; }
  }
  if(!eventId){ eventId = popForced(st); if(eventId) source = 'forced'; }
  const draws = kind === 'explore' || kind === 'ask' || (kind === 'village' && chance(st, 'event', 0.5)) || (kind === 'move' && arg === 'market' && chance(st, 'event', 0.35));
  if(!eventId && draws){
    eventId = popStory(c, st, st.location); if(eventId) source = 'story';
    if(!eventId){ eventId = drawNormal(c, st, st.location); source = 'normal'; }
  }
  if(kind === 'explore'){
    st.stats.explores++;
    // 突破材料保底（misc-rules 第三节，待确认）：圆满后缺材料，每探索 8 次必定出一次「灵物出世」
    const nx = c.realms[st.realm + 1];
    if(nx?.material && st.realm >= 1 && atRealmPeak(c, st) && materialCount(c, st, nx.material) < nx.materialCount){
      st.flags.matWait = Number(st.flags.matWait ?? 0) + 1;
      if(Number(st.flags.matWait) >= MATERIAL_PITY && !st.queue.some(q => q.event === 'M_lingwu')){ st.flags.matWait = 0; st.queue.push({ event: 'M_lingwu', due: st.actions + 1, prio: 3 }); }
    }
    // 历练：外出探索本身就有修为（systems 1.4「事件本身也会给修为，平均每次 +15%」；事件里写明的修为另算）
    if(!atRealmPeak(c, st)){ const g = cultGain(c, st, EXPLORE_CULT); st.cult += g; out.push(`一路历练，修为 +${Math.round(g * 100)}%。`); }
    st.exploreStreak = st.exploreStreak.loc === st.location ? { loc: st.location, n: st.exploreStreak.n + 1 } : { loc: st.location, n: 1 };
    if(st.location === 'wilds' && st.stats.explores >= 5 && !st.flags.valley){ st.flags.valley = true; out.push('你在山野深处发现了一条通往「落霞谷」的小径。'); }
  }
  delete st.flags.justHealed;
  preCategory(c, st, st.location);   // 为下一次探索预抽类别（event-draw 4.1）

  if(eventId){
    // 收益倍率：秘境收益（systems 9.2）× 资源枯竭（同一地点连续探索 3 次后 -20%，systems 9.1）
    if(kind === 'explore') st.flags.__reward = (loc?.reward ?? 1) * (st.exploreStreak.n > 3 ? 0.8 : 1);
    present(c, st, eventId, source, out); return { state: st, view: view(st, out) };
  }
  tick(c, st, out);
  return { state: st, view: view(st, out) };
}

// ───────────── 事件 ─────────────

const FORTUNE_TEXT: Record<string, { text: string; hint: string; effects: any[] }> = {
  fortune: { text: '✦ 福至心灵：你隐约觉得，不必贪多', hint: '稳妥：修为 +15%，并得一件黄阶物品；放弃事件本身的收益', effects: [{ cult: 0.15 }, { randomItem: 'pill_yellow' }] },
  danger: { text: '✦ 化险为夷：你察觉到一条不起眼的退路', hint: '安全避开这次危险，路上捡到灵石 +20×', effects: [{ stones: 20 }] },
  resource: { text: '✦ 顺手牵羊：比预想中多出一份', hint: '稳妥地得到两份灵草', effects: [{ randomItem: 'herb', n: 2 }] },
  encounter: { text: '✦ 一见如故：你们聊得很投机', hint: '散修好感 +5，并得到一颗黄阶丹药', effects: [{ faction: 'sanxiu', add: 5 }, { randomItem: 'pill_yellow' }] },
};

function present(c: Content, st: RunState, id: string, source: Pending['source'], out: string[]): void {
  const ev = c.events[id]; if(!ev) throw new Error('未知事件：' + id);
  st.seen[id] = (st.seen[id] ?? 0) + 1; st.lastSeen[id] = st.stats.events; st.stats.events++;
  const combat = ev.combat === '@beast' ? pickBeast(c, st) : ev.combat ? c.combat[ev.combat] : undefined;
  if(combat) st.flags.__combat = combat.id; else delete st.flags.__combat;
  const opts: PendingOption[] = [];
  ev.options.forEach((o, i) => {
    if(!checkAll(c, st, o.requires)) return;
    let reason = affordable(c, st, o.cost) ?? undefined;
    if(!reason && o.result.type === 'duel') reason = approachAvailable(c, st, o.result.approach) ?? undefined;
    let hint = o.hint;
    if(o.result.type === 'duel' && !reason){ const p = estimate(c, st, o.result.enemy, o.result.approach, o.result.bonus ?? 0, combat); hint += `（把握约 ${Math.round(p * 10)} 成）`; }
    opts.push({ index: i, text: fill(st, o.text), hint: fill(st, hint), enabled: !reason, reason });
  });
  const fortune = source === 'normal' && rollFortune(c, st, ev);
  if(fortune){ const f = FORTUNE_TEXT[ev.category]; opts.push({ index: -1, text: f.text, hint: f.hint, enabled: true, fortune: true }); }
  if(!opts.some(o => o.enabled)) opts.push({ index: -2, text: '离开', hint: '什么也不做', enabled: true });
  const enemyName = combat?.enemy ?? '';
  st.pending = { event: id, text: fill(st, ev.text, { 敌人: enemyName }), options: opts, fortune, source };
  if(ev.tags?.includes('first_meet')) st.flags.lastMeet = st.actions;
}

export interface ChooseOptions { adWatched?: boolean }

export function choose(c: Content, st0: RunState, optIndex: number, o: ChooseOptions = {}): { state: RunState; view: View } {
  const st = structuredClone(st0);
  const out: string[] = [];
  const p = st.pending; if(!p) throw new Error('当前没有待选择的事件');
  const opt = p.options.find(x => x.index === optIndex);
  if(!opt || !opt.enabled) throw new Error('这个选项不能选');
  st.steps++;
  st.pending = null;

  if(p.event === '__ad_revive') return resolveRevive(c, st, optIndex === 0 && o.adWatched !== false, out);
  if(p.event === '__ad_relief') return resolveRelief(c, st, optIndex === 0 && o.adWatched !== false, out);
  if(p.event === '__visit' || p.event === '__gift'){
    if(p.event === '__visit' && optIndex === 1){ openGift(c, st); return { state: st, view: view(st, out) }; }
    if(p.event === '__visit' && optIndex === 0) chat(c, st, out);
    if(p.event === '__visit' && optIndex === 2) special(c, st, out);
    if(p.event === '__gift' && optIndex >= 0) giveGift(c, st, giftList(c, st)[optIndex], out);
    delete st.flags.__visit;
    tick(c, st, out); return { state: st, view: view(st, out) };
  }

  const ev = c.events[p.event];
  if(optIndex === -1){ apply(c, st, FORTUNE_TEXT[ev.category].effects as any, out); }
  else if(optIndex >= 0) resolveOption(c, st, ev, ev.options[optIndex], out);

  const next = st.flags.__chain as string | undefined;
  delete st.flags.__chain;
  if(!next) delete st.flags.__reward;
  if(next === '@redraw' && !st.flags.dying){ const id = drawNormal(c, st, st.location); if(id){ present(c, st, id, 'normal', out); return { state: st, view: view(st, out) }; } }
  else if(next && !st.flags.dying){ present(c, st, next, 'chain', out); return { state: st, view: view(st, out) }; }
  tick(c, st, out);
  return { state: st, view: view(st, out) };
}

function resolveOption(c: Content, st: RunState, ev: EventDef, opt: OptionDef, out: string[]): void {
  apply(c, st, opt.cost, out);
  if(opt.time) passTime(c, st, years(c, st, opt.time));
  const r = opt.result;
  if(r.type === 'fixed'){ if(r.text) out.unshift(fill(st, r.text)); apply(c, st, r.effects, out); return; }
  if(r.type === 'chance'){
    let p = r.p + (r.luck ? st.luck / 100 : 0) + (r.stat === 'mood' ? (st.mood - 60) / 200 : 0);
    p = clamp(p, 0.05, 0.95);
    const b = rand(st, 'check') < p ? r.success : r.fail;
    if(b.text) out.unshift(fill(st, b.text));
    apply(c, st, b.effects, out);
    return;
  }
  const combat = st.flags.__combat ? c.combat[String(st.flags.__combat)] : undefined;
  const woxin = ev.id === 'Z_ambush' && st.flags.woxin ? 0.15 : 0; if(woxin) delete st.flags.woxin;
  const d = duel(c, st, r.enemy, r.approach, (r.bonus ?? 0) + woxin, r.tiers, combat, st.location);
  out.unshift(d.text);
  out.push(...d.lines);
  if(d.tier !== 'escaped') st.flags.lastDuelDeath = true;
  if((d.tier === 'big' || d.tier === 'win') && !st.flags.__chain){
    if(r.enemy.kind === 'beast' && chance(st, 'loot', 0.2)) st.flags.__chain = 'Z09';
    else if(r.enemy.kind === 'cultivator' && chance(st, 'loot', 0.1)) st.flags.__chain = 'Z10';
  }
}

// ───────────── 突破（systems 1.5，misc-rules 6.6） ─────────────

export function breakRate(c: Content, st: RunState, mode: 'normal' | 'stable' | 'forced'): number {
  const next = c.realms[st.realm + 1];
  let p = next.breakRate ?? 0;
  p += st.foundation >= 50 ? (st.foundation - 50) * 0.005 : (st.foundation - 50) * 0.01;
  if(mode === 'stable') p += 0.2 + 0.15;            // 稳妥 +20%，服破境丹 +15%
  if(st.status.heartDemon) p -= 0.1;
  if(st.flags.tempMaster === st.realm) p += 0.1;
  if(st.flags.xqDisciple) p += 0.1;                   // 玄清真人的入室弟子：突破前指点      // J03 临时师父：持续到下一个大境界
  if(st.flags.desperate) p += 0.15;                   // W13 搏命冲关
  if(mode === 'forced') p *= 0.5;
  return clamp(p, 0.05, 0.95);
}

function breakthrough(c: Content, st: RunState, mode: 'normal' | 'stable' | 'forced', out: string[]): void {
  const next = c.realms[st.realm + 1];
  const p = breakRate(c, st, mode);
  passTime(c, st, years(c, st, 1));
  st.actions++;
  if(mode !== 'forced' && next.material) payMaterial(c, st, next.material, next.materialCount, out);
  if(mode === 'stable') addItem(c, st, 'pojing_dan', -1, out);
  if(rand(st, 'check') < p){
    st.realm++; st.layer = 1; st.cult = 0; st.stats.breakthroughs++; delete st.flags.desperate;
    out.push(`突破成功，晋入${next.name}！`);
    if(st.flags.longevityTablet && Number(st.flags.tabletBonus ?? 0) < 10){ st.flags.tabletBonus = Number(st.flags.tabletBonus ?? 0) + 2; st.lifeBonus += 2; out.push('远方的长生牌位前香火不断，寿元上限 +2。'); }   // D05
    st.log.push({ age: Math.floor(st.age), type: 'breakthrough', weight: 8, text: `${cnAge(st.age)}岁${next.name === '金丹' ? '结成金丹' : next.name === '元婴' ? '凝结元婴' : '突破' + next.name}` });
    return;
  }
  st.stats.breakFails++;
  st.breakCooldown = true;
  out.push(`冲击${next.name}失败了。`);
  st.flags.__relief = mode;
  if(!st.ads.relief.includes(st.realm + 1)){
    st.pending = { event: '__ad_relief', text: '灵力在经脉里乱窜，失败的反噬就要落下。', source: 'forced', options: [
      { index: 0, text: '看一段广告，免除这次失败的后果', hint: '本境界只能用一次；这次突破仍算失败', enabled: true },
      { index: 1, text: '咬牙承受', hint: failHint(next.failure![mode === 'forced' ? 'forced' : 'normal']), enabled: true },
    ] };
    return;
  }
  applyFailure(c, st, mode, out);
}

/** 突破材料数量：半枚（如半枚婴元果）按 0.5 计 */
const HALF: Record<string, string> = { yingyuan_guo: 'yingyuan_ban' };
function materialCount(c: Content, st: RunState, id: string): number { return count(st, id) + (HALF[id] ? count(st, HALF[id]) / 2 : 0); }
function payMaterial(c: Content, st: RunState, id: string, n: number, out: string[]): void {
  const whole = Math.min(n, count(st, id));
  if(whole) addItem(c, st, id, -whole, out);
  if(n > whole && HALF[id]) addItem(c, st, HALF[id], -(n - whole) * 2, out);
}

function failHint(f: { cult: number; foundation: number; heavy: number; death: number }): string {
  return [f.cult ? `修为 -${f.cult * 100}%` : '', f.foundation ? `根基 -${f.foundation}` : '', f.heavy ? `${f.heavy >= 1 ? '' : Math.round(f.heavy * 100) + '% '}重伤` : '', f.death ? `${Math.round(f.death * 100)}% 身死` : ''].filter(Boolean).join('，');
}

function applyFailure(c: Content, st: RunState, mode: string, out: string[]): void {
  const f = c.realms[st.realm + 1].failure![mode === 'forced' ? 'forced' : 'normal'];
  st.cult = Math.max(0, st.cult - f.cult);
  if(f.foundation){ st.foundation -= f.foundation; out.push(`根基 -${f.foundation}。`); }
  if(f.light) setStatus(c, st, 'light', out);
  if(f.heavy && chance(st, 'check', f.heavy)) setStatus(c, st, 'heavy', out);
  if(f.dropLayer && chance(st, 'check', f.dropLayer) && st.layer > 1){ st.layer--; out.push('境界跌落了一个小层级。'); }
  if(f.death && chance(st, 'check', f.death)) st.flags.dying = 'tribulation';
  if(st.flags.desperate){ delete st.flags.desperate; st.flags.dying = 'breakthrough'; }
}

function resolveRelief(c: Content, st: RunState, watched: boolean, out: string[]) {
  const mode = String(st.flags.__relief); delete st.flags.__relief;
  if(watched){ st.ads.relief.push(st.realm + 1); st.stats.adsWatched++; out.push('一股清凉之气护住了心脉，这次的反噬烟消云散。'); }
  else applyFailure(c, st, mode, out);
  tick(c, st, out);
  return { state: st, view: view(st, out) };
}

function resolveRevive(c: Content, st: RunState, watched: boolean, out: string[]) {
  if(watched){
    st.ads.revive = true; st.stats.adsWatched++;
    // 恢复原样：这一次致命的结果作废，伤势保持出事前的样子；之后一切照常（misc-rules 6.4，README 第 11 条）
    delete st.flags.dying;
    out.push('鬼门关前，你硬生生地被拉了回来。');
    tick(c, st, out, true);
  } else endRun(c, st, 'death', String(st.flags.dying ?? 'unknown'));
  return { state: st, view: view(st, out) };
}

// ───────────── 每一步的收尾（misc-rules 6.1 第 8–13 步） ─────────────

function tick(c: Content, st: RunState, out: string[], skipDeath = false): void {
  // 第 8 步：生死判定与保命顺序（misc-rules 6.4）
  if(!skipDeath && st.flags.dying){
    const fromDuel = !!st.flags.lastDuelDeath;
    if(fromDuel && (st.npcs.lin_xiaowan?.aff ?? 0) >= 90 && !st.flags.linSaved){ st.flags.linSaved = true; delete st.flags.dying; st.status.heavy = 2; out.push('一道身影扑到你身前，替你挡下了那致命一击——是林小婉。'); }
    else if(st.talents.includes('R15') && !st.flags.ninedeaths){ st.flags.ninedeaths = true; delete st.flags.dying; st.status.heavy = 2; st.foundation -= 20; out.push('九死一生，你竟然又从鬼门关爬了回来。根基 -20。'); }
    else if(count(st, 'tishen_fu') > 0){ addItem(c, st, 'tishen_fu', -1, out); delete st.flags.dying; out.push('替身符化作飞灰，替你挡了这一劫。'); }
    else if(!st.ads.revive){
      st.pending = { event: '__ad_revive', text: '你感觉生机正一点点从身体里流走……', source: 'forced', options: [
        { index: 0, text: '看一段广告，留住这条命', hint: '每局一次：转为重伤，不扣根基', enabled: true },
        { index: 1, text: '坦然受之', hint: '这一生到此为止', enabled: true },
      ] };
      delete st.flags.lastDuelDeath;
      return;
    }
    else { endRun(c, st, 'death', String(st.flags.dying)); return; }
  }
  delete st.flags.lastDuelDeath;
  // 第 9 步：修为满额升层；大境界圆满停在 100%
  const r = realmOf(c, st);
  while(st.cult >= 1 && st.layer < r.layers){ st.cult -= 1; st.layer++; out.push(`进入${layerName(c, st)}。`); }
  if(st.layer >= r.layers) st.cult = Math.min(st.cult, 1);
  // 第 10 步：寿元
  if(lifeLeft(c, st) <= 0){ endRun(c, st, 'lifespan'); return; }
  if(lifeLeft(c, st) < 10 && !st.flags.w13 && c.events.W13){ st.flags.w13 = true; st.queue.push({ event: 'W13', due: st.actions, prio: 2 }); }
  // 第 11 步：世界状态计时
  if(st.flags.partner && st.actions >= Number(st.flags.partnerNext ?? 0)){
    if(st.flags.partnerNext !== undefined){
      if(chance(st, 'loot', 0.2)){ delete st.flags.partner; out.push('钱多多派人捎来口信：商队在路上遭了劫，本钱全没了。'); }
      else { const n = Math.round(150 * stoneCoef(c, st)); st.stones += n; out.push(`钱多多的商队回来了，分红灵石 +${n}。`); }
    }
    st.flags.partnerNext = st.actions + 6;
  }
  if(st.flags.hunted && !st.queue.some(q => q.event === 'S_hunt')) st.queue.push({ event: 'S_hunt', due: st.actions + 8, prio: 5 });   // 叛宗：每 8 次行动追杀一次
  for(const w of [...st.world]) if(st.actions >= w.until){
    st.world.splice(st.world.indexOf(w), 1);
    if(w.id === 'tide_high') st.world.push({ id: 'tide_low', until: st.actions + 5 });
    const shut = Object.values(c.locations).find(l => l.id === st.location && l.unlock?.some(u => 'world' in u && u.world === w.id));
    if(shut){ st.location = 'wilds'; out.push(`${shut.name}的入口渐渐合拢，你被送回了山野。`); }
  }
  clampStats(st);   // 第 13 步：钳制
  // 特殊事件（event-draw 第七节）
  advanceDestiny(c, st, out);
  const sp = rollSpecial(c, st, !!st.flags.firstRun);
  if(sp){
    st.seen[sp.id] = (st.seen[sp.id] ?? 0) + 1;
    out.push(fill(st, sp.text));
    if(sp.world) st.world.push({ id: sp.world.id, until: st.actions + sp.world.actions });
    apply(c, st, sp.effects, out);
    st.log.push({ age: Math.floor(st.age), type: 'special', weight: 6, text: `亲历${sp.name}` });
    if(sp.event) st.queue.push({ event: sp.event, due: st.actions, prio: 1 });
  }
}

/** 属性钳制（misc-rules 第 13 步）；一局结束时也要做，死亡会提前结束 tick */
function clampStats(st: RunState): void {
  st.foundation = clamp(st.foundation, 0, 100); st.luck = clamp(st.luck, 0, 50);
  st.mood = clamp(st.mood, st.talents.includes('C11') ? 30 : 0, st.status.heartDemon ? 80 : 100);
  st.dao = clamp(st.dao, -100, 100); st.tox = clamp(st.tox, 0, 10);
}

function endRun(c: Content, st: RunState, how: 'death' | 'lifespan' | 'retire', cause?: string): void {
  st.pending = null;
  clampStats(st);
  closeDestiny(c, st);
  const ending = how === 'death' ? 'death' : 'natural';   // TODO(下一步)：一方强者、传承留世、飞升问道的判定（systems 第 10 节）
  st.ended = { ending, cause };
  st.log.push({ age: Math.floor(st.age), type: 'end', weight: 100, text: how === 'death' ? `${cnAge(st.age)}岁身死道消` : `最终坐化于${cnAge(st.age)}岁` });
}

const cnAge = (a: number) => String(Math.floor(a));

const STUDY_YEARS: Record<string, number> = { yellow: 0.5, mystic: 1, earth: 2, heaven: 3 };   // systems 2.1
function studyYears(c: Content, st: RunState, id: string): number { return Math.round(years(c, st, STUDY_YEARS[c.items[id].grade] ?? 1) * (mods(c, st).learnMult ?? 1) * 10) / 10; }

// ───────────── 集市与物品 ─────────────

export function buy(c: Content, st0: RunState, itemId: string): RunState {
  const st = structuredClone(st0);
  if(st.location !== 'market' || !st.market) throw new Error('不在集市');
  const slot = st.market.shelf.find(s => s.item === itemId && s.stock > 0); if(!slot) throw new Error('货架上没有：' + itemId);
  const price = priceOf(c, st, itemId);
  if(st.stones < price) throw new Error('灵石不足');
  const out: string[] = [];
  const before = count(st, itemId);
  addItem(c, st, itemId, 1, out);
  if(count(st, itemId) === before) throw new Error('背包放不下了');
  st.stones -= price; slot.stock--;
  return st;
}

export function sell(c: Content, st0: RunState, itemId: string): RunState {
  const st = structuredClone(st0);
  if(st.location !== 'market') throw new Error('不在集市');
  const price = sellPriceOf(c, st, itemId);
  if(price === null || (st.bag[itemId] ?? 0) <= 0) throw new Error('卖不了：' + itemId);
  addItem(c, st, itemId, -1, []); st.stones += price;
  return st;
}

/** 穿上装备，换下来的放回背包；不耗时 */
export function equip(c: Content, st0: RunState, itemId: string): RunState {
  const st = structuredClone(st0);
  const it = c.items[itemId];
  if(!it?.slot || (st.bag[itemId] ?? 0) <= 0) throw new Error('不能装备：' + itemId);
  const old = st.equip[it.slot];
  addItem(c, st, itemId, -1, []);
  st.equip[it.slot] = itemId;
  if(old) st.bag[old] = (st.bag[old] ?? 0) + 1;
  return st;
}

/** 服用丹药、使用符箓之外的消耗品；不耗时 */
export function usePill(c: Content, st0: RunState, itemId: string): { state: RunState; lines: string[] } {
  const st = structuredClone(st0);
  const it = c.items[itemId];
  if(!it?.use || (st.bag[itemId] ?? 0) <= 0) throw new Error('不能使用：' + itemId);
  const out: string[] = [];
  addItem(c, st, itemId, -1, out);
  apply(c, st, it.use, out);
  if(it.tox) st.tox = clamp(st.tox + it.tox, 0, 10);
  return { state: st, lines: out.filter(l => !l.startsWith('获得')) };
}

// ───────────── 给界面的输出 ─────────────

function view(st: RunState, text: string[]): View { return { text, pending: st.pending, ended: st.ended }; }

export function summary(c: Content, st: RunState) {
  return {
    name: st.name, origin: c.origins.find(o => o.id === st.origin)?.name, talents: st.talents.map(t => c.talents.find(x => x.id === t)?.name),
    realm: layerName(c, st), cult: Math.round(st.cult * 100), age: Math.floor(st.age), lifespan: Math.floor(lifespan(c, st)), stones: st.stones,
    foundation: st.foundation, luck: st.luck, mood: st.mood, dao: st.dao, location: c.locations[st.location]?.name, stoneCoef: stoneCoef(c, st),
  };
}

export { CAT_NAME };
