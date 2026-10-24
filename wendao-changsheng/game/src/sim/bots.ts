// 模拟用的三种机器人（balance-targets 1.1）：随机型、稳健型、激进型
// 机器人只调用引擎的公开接口，和真实玩家走同一条路径
import type { Content, Effect, OptionDef, RunState } from '../engine/types.ts';
import { act, actions, buy, choose, equip, sell, usePill } from '../engine/engine.ts';
import { estimate } from '../engine/combat.ts';
import { count } from '../engine/effects.ts';
import { priceOf, sellPriceOf } from '../engine/market.ts';
import { lifeLeft, stoneCoef } from '../engine/calc.ts';
import { rand } from '../engine/rng.ts';

export type BotKind = 'random' | 'steady' | 'aggressive';
export interface BotOptions { kind: BotKind; watchAds: boolean }

/** 机器人自己的随机数，和游戏的四条流分开，保证机器人的选择不干扰游戏的确定性 */
function botRand(st: RunState): number { const s = { rng: { event: st.seed ^ (st.steps * 7919), check: 0, loot: 0, text: 0 } }; return rand(s as any, 'event'); }

/** 跑一步：有待选事件就选，否则做一个行动（顺带处理不耗时的服药、买卖、换装） */
export function step(c: Content, st: RunState, o: BotOptions): RunState {
  if(st.pending) return choose(c, st, pickOption(c, st, o), { adWatched: o.watchAds || (o.kind === 'random' && botRand(st) < 0.5) }).state;
  if(o.kind !== 'random') st = housekeeping(c, st, o);
  const id = pickAction(c, st, o);
  return act(c, st, id).state;
}

// ───────────── 选项 ─────────────

function value(c: Content, st: RunState, effects: Effect[] | undefined): number {
  let v = 0;
  const sc = stoneCoef(c, st);
  for(const e of effects ?? []){
    if('cult' in e) v += e.cult * 100;
    else if('stones' in e) v += e.stones * 0.3;
    else if('stonesPct' in e) v += e.stonesPct * st.stones / sc * 0.3;
    else if('item' in e) v += (e.n ?? 1) * 8;
    else if('randomItem' in e) v += (e.n ?? 1) * (e.randomItem.startsWith('book') ? 25 : 8);
    else if('stat' in e) v += e.add * ({ foundation: 2, luck: 3, mood: 0.6, dao: 0.1, tox: -3 } as any)[e.stat];
    else if('status' in e) v += ({ light: -15, heavy: -70, poison: -25, heartDemon: -40 } as any)[e.status];
    else if('cure' in e) v += 15;
    else if('lifespan' in e) v += e.lifespan * 3;
    else if('die' in e) v -= 1000;
    else if('chain' in e) v += e.chain === 'W01' || e.chain.startsWith('W') ? -15 : 0;
    else if('lend' in e) v -= e.lend * st.stones / sc * 0.15;
    else if('schedule' in e) v += 5;
  }
  return v;
}

function optionValue(c: Content, st: RunState, opt: OptionDef, aggressive: boolean): number {
  const cost = value(c, st, opt.cost) - (opt.time ?? 0) * 5;
  const r = opt.result;
  if(r.type === 'fixed') return cost + value(c, st, r.effects) + 1;
  if(r.type === 'chance'){
    const p = Math.min(0.95, r.p + (r.luck ? st.luck / 100 : 0));
    const s = value(c, st, r.success.effects), f = value(c, st, r.fail.effects);
    return cost + (aggressive ? Math.max(s, p * s + (1 - p) * f) : p * s + (1 - p) * f);
  }
  const ev = c.events[st.pending!.event];
  const combat = st.flags.__combat ? c.combat[String(st.flags.__combat)] : undefined;
  const p = estimate(c, st, r.enemy, r.approach, r.bonus ?? 0, combat);
  if(r.approach === 'flee' || r.approach === 'talk') return cost + p * 2 - (1 - p) * 25;
  const win = value(c, st, (r.tiers?.win ?? r.tiers?.big)?.effects) + 12;
  const heavyRisk = (1 - p) * 0.4;
  const lossValue = -15 - heavyRisk * (st.status.heavy > 0 ? 1000 : 70);
  void ev;
  return cost + p * win + (1 - p) * lossValue - (r.approach === 'item' ? 4 : 0);
}

function pickOption(c: Content, st: RunState, o: BotOptions): number {
  const p = st.pending!;
  const opts = p.options.filter(x => x.enabled);
  if(p.event === '__ad_revive' || p.event === '__ad_relief') return o.kind === 'random' ? opts[Math.floor(botRand(st) * opts.length)].index : (o.watchAds ? 0 : 1);
  if(o.kind === 'random') return opts[Math.floor(botRand(st) * opts.length)].index;
  const ev = c.events[p.event];
  let best = opts[0].index, bestV = -Infinity;
  for(const x of opts){
    const v = x.index === -1 ? 18 : x.index === -2 ? 0 : optionValue(c, st, ev.options[x.index], o.kind === 'aggressive');
    if(v > bestV){ bestV = v; best = x.index; }
  }
  return best;
}

// ───────────── 行动 ─────────────

function housekeeping(c: Content, st: RunState, o: BotOptions): RunState {
  const use = (id: string) => { if(count(st, id) > 0 && (st.bag[id] ?? 0) > 0) st = usePill(c, st, id).state; };
  if(st.status.heavy > 0) use('xuming_dan');
  if(st.status.heavy > 0 && count(st, 'lingquan_shui') > 0) use('lingquan_shui');
  if(st.status.light > 0 && st.status.heavy === 0) use('huichun_dan');
  if(st.status.poison) use('jiedu_dan');
  if(st.status.heartDemon) use('qingxin_dan');
  while((st.bag.juqi_dan ?? 0) > 0 && st.tox < (o.kind === 'aggressive' ? 6 : 4) && st.cult < 0.8) use('juqi_dan');
  for(const id of Object.keys(st.bag)){
    const it = c.items[id];
    if(it?.slot && !st.equip[it.slot]) st = equip(c, st, id);
  }
  if(st.location === 'market' && st.market){
    // 卖掉材料，留下灵兽肉和灵泉水
    for(const id of Object.keys(st.bag)){
      const it = c.items[id];
      if(it?.kind === 'material' && !['lingshou_rou', 'lingquan_shui'].includes(id) && sellPriceOf(c, st, id) !== null){
        while((st.bag[id] ?? 0) > 0) st = sell(c, st, id);
      }
    }
    const tryBuy = (id: string, keep: number) => {
      while(count(st, id) < keep && st.market!.shelf.some(s => s.item === id && s.stock > 0) && st.stones >= priceOf(c, st, id)){
        try{ st = buy(c, st, id); }catch{ break; }
      }
    };
    tryBuy('zhuji_dan', st.realm === 0 ? 1 : 0);
    if(st.realm > 0 || count(st, 'zhuji_dan') > 0){
      tryBuy('huichun_dan', 2); tryBuy('jiedu_dan', 1); tryBuy('huoqiu_fu', o.kind === 'aggressive' ? 3 : 2);
      tryBuy('pojing_dan', 1); tryBuy('xuming_dan', 1);
      for(const s of st.market?.shelf ?? []) if(c.items[s.item]?.kind === 'technique' && st.stones > priceOf(c, st, s.item) * 2) tryBuy(s.item, 1);
    }
  }
  return st;
}

function pickAction(c: Content, st: RunState, o: BotOptions): string {
  const list = actions(c, st).filter(a => a.enabled);
  const has = (id: string) => list.some(a => a.id === id);
  if(o.kind === 'random') return list[Math.floor(botRand(st) * list.length)].id;

  if(has('break:stable')) return 'break:stable';
  if(has('break:normal')) return 'break:normal';
  if(o.kind === 'aggressive' && has('break:forced')) return 'break:forced';
  if(o.kind === 'steady' && has('break:forced') && lifeLeft(c, st) < 15) return 'break:forced';
  const study = list.find(a => a.id.startsWith('study:')); if(study) return study.id;

  const needPill = st.realm === 0 && st.layer >= 7 && count(st, 'zhuji_dan') === 0;
  const sinceMarket = st.actions - Number(st.flags.botMarketAt ?? -99);
  if(st.location === 'market'){ st.flags.botMarketAt = st.actions; return has('move:wilds') ? 'move:wilds' : list[0].id; }
  if(has('move:market') && ((needPill && st.stones >= 200) || (sinceMarket > 12 && st.stones > 40 * stoneCoef(c, st)))) return 'move:market';
  if(st.location !== 'wilds' && st.location !== 'valley' && has('move:wilds')) return 'move:wilds';

  const peak = !has('cultivate') && !has('push');
  const cultivateId = o.kind === 'aggressive' && has('push') ? 'push' : 'cultivate';
  if(peak) return has('explore') ? 'explore' : list[0].id;
  if(st.status.heavy > 0 && has('cultivate')) return 'cultivate';
  if(st.foundation < 40 && has('temper') && o.kind === 'steady') return 'temper';
  const lastWasExplore = st.flags.botLast === 'explore';
  const id = lastWasExplore && has(cultivateId) ? cultivateId : has('explore') ? 'explore' : cultivateId;
  st.flags.botLast = id;
  return id;
}
