// 条件判断、效果结算、文本模板
// 扣不够的处理按 misc-rules 第五节：主动代价不够时选项置灰；被动损失扣到 0，不欠债
import type { Cond, Content, Effect, RunState, StatKey } from './types.ts';
import { clamp, cultGain, lifeLeft, mods, stoneCoef, years } from './calc.ts';
import { pick, rand, weighted } from './rng.ts';

export const BAG_SLOTS = 20;

/** 当前事件的收益倍率：秘境收益 × 资源枯竭（在 present 时设定，结算后清除） */
const rewardMult = (st: RunState) => Number(st.flags.__reward ?? 1);

export function check(c: Content, st: RunState, cond: Cond): boolean {
  const k = Object.keys(cond)[0];
  const v: any = (cond as any)[k];
  switch(k){
    case 'stat': { const s = cond as { stat: StatKey; gte?: number; lte?: number }; const x = statOf(st, s.stat); return (s.gte === undefined || x >= s.gte) && (s.lte === undefined || x <= s.lte); }
    case 'realmGte': return st.realm >= v;
    case 'realmLte': return st.realm <= v;
    case 'layerGte': return st.layer >= v;
    case 'actionsGte': return st.actions >= v;
    case 'ageGte': return st.age >= v;
    case 'ageLt': return st.age < v;
    case 'hasItem': return count(st, v) >= ((cond as any).n ?? 1);
    case 'notItem': return count(st, v) === 0;
    case 'flag': return !!st.flags[v];
    case 'notFlag': return !st.flags[v];
    case 'seen': return (st.seen[v] ?? 0) > 0;
    case 'origin': return st.origin === v;
    case 'talent': return st.talents.includes(v);
    case 'npcAffGte': return (st.npcs[v[0]]?.aff ?? -999) >= v[1];
    case 'npcMet': return !!st.npcs[v]?.met;
    case 'notNpcMet': return !st.npcs[v]?.met;
    case 'status': return statusOn(st, v);
    case 'notStatus': return !statusOn(st, v);
    case 'world': return st.world.some(w => w.id === v);
    case 'lifeLeftLt': return lifeLeft(c, st) < v;
    case 'gender': return st.gender === v;
    case 'technique': return st.techniques.includes(v);
    case 'anyOf': return (v as Cond[]).some(x => check(c, st, x));
    case 'exploresGte': return st.stats.explores >= v;
    case 'equipped': return !!st.equip[v as 'weapon'];
    case 'inSect': return !!st.sect === v;
    case 'sectIs': return st.sect?.id === v;
    case 'sectRankGte': return !!st.sect && st.sect.rank >= v;
    case 'sectRankIs': return !!st.sect && st.sect.rank === v;
  }
  throw new Error('未知条件：' + k);
}
export const checkAll = (c: Content, st: RunState, conds?: Cond[]) => !conds || conds.every(x => check(c, st, x));

function statusOn(st: RunState, k: string): boolean {
  if(k === 'light') return st.status.light > 0;
  if(k === 'heavy') return st.status.heavy > 0;
  return !!(st.status as any)[k];
}
const statOf = (st: RunState, k: StatKey) => k === 'tox' ? st.tox : (st as any)[k] as number;

export const count = (st: RunState, id: string) => (st.bag[id] ?? 0) + (st.keyItems[id] ?? 0);
const isKey = (c: Content, id: string) => ['breakthrough', 'key'].includes(c.items[id]?.kind);

/** 背包占用的格数：每种物品每 10 个占 1 格；要物栏不占（misc-rules 4.1） */
export function bagUsed(c: Content, st: RunState): number {
  return Object.entries(st.bag).reduce((a, [id, n]) => a + (n > 0 ? (c.items[id]?.kind === 'equip' ? n : Math.ceil(n / 10)) : 0), 0);
}
export const bagCap = (c: Content, st: RunState) => BAG_SLOTS + (st.equip.accessory === 'chuwu_jie' ? 5 : 0);

/** 主动代价能不能付得起（misc-rules 5.1） */
export function affordable(c: Content, st: RunState, cost?: Effect[]): string | null {
  for(const e of cost ?? []){
    if('stones' in e && st.stones < -e.stones * stoneCoef(c, st)) return `灵石不足（需要 ${Math.ceil(-e.stones * stoneCoef(c, st))}）`;
    if('item' in e && (e.n ?? 1) < 0 && count(st, e.item) < -(e.n ?? 1)) return `缺少${c.items[e.item]?.name ?? e.item}`;
    if('cult' in e && e.cult < 0 && st.cult < -e.cult) return '修为不足';
    if('lifespan' in e && e.lifespan < 0 && lifeLeft(c, st) + e.lifespan <= 0) return '寿元不足';
    if('contrib' in e && e.contrib < 0 && (st.sect?.avail ?? 0) < -e.contrib) return `可用贡献不足（需要 ${-e.contrib}）`;
  }
  return null;
}

export function addItem(c: Content, st: RunState, id: string, n: number, out: string[]): void {
  const it = c.items[id]; if(!it) throw new Error('未知物品：' + id);
  if(n < 0){
    const store = (st.keyItems[id] ?? 0) > 0 ? st.keyItems : st.bag;
    store[id] = Math.max(0, (store[id] ?? 0) + n); if(!store[id]) delete store[id];
    return;
  }
  if(isKey(c, id)){ st.keyItems[id] = (st.keyItems[id] ?? 0) + n; out.push(`获得${it.name}×${n}。`); return; }
  // 背包满了：界面里会弹取舍（misc-rules 4.2）；引擎默认放弃新物品，模拟脚本也按此结算
  // TODO(界面)：接入「丢掉旧的 / 放弃新的 / 寄放洞府」三选一
  const before = st.bag[id] ?? 0;
  st.bag[id] = before + n;
  if(bagUsed(c, st) > bagCap(c, st)){ st.bag[id] = before; if(!before) delete st.bag[id]; out.push(`背包已满，只好放下${it.name}。`); return; }
  out.push(`获得${it.name}×${n}。`);
}

export function randomItemOf(c: Content, st: RunState, tag: string): string {
  if(tag === 'herb' && st.realm >= 1 && rand(st, 'loot') < (c.locations[st.location]?.secret ? 0.4 : 0.2)) return 'ningjin_cao';
  const pool = Object.values(c.items).filter(i => i.tags?.includes(tag));
  if(!pool.length) throw new Error('没有带标签的物品：' + tag);
  return pick(st, 'loot', pool).id;
}

/** 结算一组效果。死亡只做标记（st.flags.dying），由引擎在第 8 步统一判定（misc-rules 6.1） */
export function apply(c: Content, st: RunState, effects: Effect[] | undefined, out: string[]): void {
  for(const e of effects ?? []){
    if('cult' in e){
      const g = e.cult > 0 ? cultGain(c, st, e.cult) * rewardMult(st) : e.cult;
      st.cult = Math.max(0, st.cult + g);
      out.push(e.cult > 0 ? `修为 +${Math.round(g * 100)}%。` : `修为 ${Math.round(e.cult * 100)}%。`);
    }
    else if('stones' in e){
      const n = Math.round(e.stones * stoneCoef(c, st) * (e.stones > 0 ? rewardMult(st) : 1));
      st.stones = Math.max(0, st.stones + n);
      out.push(n >= 0 ? `灵石 +${n}。` : `灵石 ${n}。`);
    }
    else if('stonesPct' in e){ const n = Math.round(st.stones * e.stonesPct); st.stones = Math.max(0, st.stones + n); out.push(`灵石 ${n >= 0 ? '+' : ''}${n}。`); }
    else if('item' in e) addItem(c, st, e.item, e.n ?? 1, out);
    else if('randomItem' in e){ for(let i = 0; i < (e.n ?? 1); i++) addItem(c, st, randomItemOf(c, st, e.randomItem), 1, out); }
    else if('loseRandomItem' in e){
      for(let i = 0; i < e.loseRandomItem; i++){
        const ids = Object.keys(st.bag).filter(id => st.bag[id] > 0);
        if(!ids.length) break;
        const id = pick(st, 'loot', ids); addItem(c, st, id, -1, out); out.push(`丢失了${c.items[id].name}。`);
      }
    }
    else if('stat' in e){
      const k = e.stat === 'tox' ? 'tox' : e.stat;
      (st as any)[k] = (st as any)[k] + e.add;
      out.push(`${({ foundation: '根基', luck: '气运', mood: '心境', dao: '道心', tox: '丹毒' } as any)[e.stat]} ${e.add >= 0 ? '+' : ''}${e.add}。`);
    }
    else if('status' in e) setStatus(c, st, e.status, out);
    else if('cure' in e){
      if(e.cure === 'light' || e.cure === 'injury' || e.cure === 'all') st.status.light = 0;
      if(e.cure === 'heavy' || e.cure === 'injury' || e.cure === 'all') st.status.heavy = 0;
      if(e.cure === 'poison' || e.cure === 'all') st.status.poison = false;
      if(e.cure === 'heartDemon' || e.cure === 'all') st.status.heartDemon = false;
    }
    else if('years' in e) passTime(c, st, years(c, st, e.years));
    else if('lifespan' in e){ st.lifeBonus += e.lifespan; out.push(`寿元 ${e.lifespan >= 0 ? '+' : ''}${e.lifespan}。`); }
    else if('npc' in e){ const n = (st.npcs[e.npc] ??= { aff: 0, met: true }); n.aff = clamp(n.aff + e.add, -100, 100); }
    else if('meet' in e){ if(!st.npcs[e.meet]) st.npcs[e.meet] = { aff: mods(c, st).npcAff, met: true }; else st.npcs[e.meet].met = true; }
    else if('faction' in e) st.factions[e.faction] = clamp((st.factions[e.faction] ?? 0) + e.add, -100, 100);
    else if('flag' in e) st.flags[e.flag] = e.value === '@realm' ? st.realm : e.value ?? true;
    else if('schedule' in e) st.queue.push({ event: e.schedule, due: st.actions + e.after, prio: 4 });
    else if('chain' in e) st.flags.__chain = e.chain;
    else if('ready' in e){ if(!st.ready.some(r => r.event === e.ready)) st.ready.push({ event: e.ready, locations: e.locations, since: st.actions }); }
    else if('learn' in e){ if(!st.techniques.includes(e.learn)){ st.techniques.push(e.learn); out.push(`学会了${c.techniques[e.learn]?.name ?? e.learn}。`); } }
    else if('die' in e) st.flags.dying = e.die;
    else if('log' in e) st.log.push({ age: Math.floor(st.age), type: 'event', weight: e.weight, text: e.log });
    else if('lend' in e){ const n = Math.floor(st.stones * e.lend); st.stones -= n; st.flags.loan = Number(st.flags.loan ?? 0) + n; out.push(`借出灵石 ${n}。`); }
    else if('join' in e){
      const rank = e.rank ?? 0;
      st.sect = { id: e.join, rank, total: 0, avail: 0, stipendAt: st.actions, backdoor: !!e.backdoor, s03: [], s05: [] };
      const name = c.sects.sects[e.join].name;
      out.push(`你成了${name}的${c.sects.ranks[rank].name}。`);
      st.log.push({ age: Math.floor(st.age), type: 'sect', weight: 4, text: `拜入${name}` });
    }
    else if('contrib' in e){
      if(!st.sect) continue;
      st.sect.total = Math.max(0, st.sect.total + e.contrib); st.sect.avail = Math.max(0, st.sect.avail + e.contrib);
      out.push(`宗门贡献 ${e.contrib >= 0 ? '+' : ''}${e.contrib}。`);
    }
    else if('promote' in e){
      if(!st.sect) continue;
      st.sect.rank = Math.min(c.sects.ranks.length - 1, st.sect.rank + e.promote);
      out.push(`你晋升为${c.sects.ranks[st.sect.rank].name}。`);
    }
    else if('expel' in e){
      if(!st.sect) continue;
      const name = c.sects.sects[st.sect.id].name;
      st.factions[st.sect.id] = -100; st.flags.hunted = st.sect.id; st.sect = null;
      st.queue.push({ event: 'S_hunt', due: st.actions + 8, prio: 5 });
      out.push(`你被${name}除名了。从今往后，同门就是追兵。`);
      st.log.push({ age: Math.floor(st.age), type: 'sect', weight: 6, text: `因${e.expel}，被${name}除名` });
    }
    else if('examFail' in e) st.flags['retake_' + e.examFail] = st.age + 2;
    else if('open' in e){
      const l = c.locations[e.open];
      const w = (l.unlock?.find(u => 'world' in u) as { world: string } | undefined)?.world;
      if(w){ st.world = st.world.filter(x => x.id !== w); st.world.push({ id: w, until: st.actions + e.actions }); }
      st.location = e.open; out.push(`来到了${l.name}。`);
    }
    else if('nextMaterial' in e){
      const next = c.realms[st.realm + 1];
      if(next?.material) addItem(c, st, next.material, e.nextMaterial * next.materialCount, out);
    }
    else if('repay' in e){ const n = Math.round(Number(st.flags.loan ?? 0) * e.repay); st.stones += n; st.flags.loan = 0; out.push(`灵石 +${n}。`); }
  }
}

/** 受伤：再次重伤会死亡（content-expansion 0.3） */
export function setStatus(c: Content, st: RunState, k: string, out: string[]): void {
  const m = mods(c, st);
  if(k === 'heavy' && m.heavyToLight) k = 'light';
  if(k === 'light'){ st.status.light = 2; out.push('你受了轻伤。'); }
  else if(k === 'heavy'){
    if(st.status.heavy > 0){ st.flags.dying = 'heavy_again'; return; }
    st.status.heavy = 2; st.status.everHeavy = true; st.flags.everHeavy = true; out.push('你受了重伤。');
  }
  else if(k === 'poison'){ if(m.poisonImmune){ out.push('毒性对你无效。'); return; } st.status.poison = true; out.push('你中毒了。'); }
  else if(k === 'heartDemon'){ st.status.heartDemon = true; out.push('心中种下了心魔。'); }
}

/** 推进时间：中毒时额外损失同样多的寿元（misc-rules 第三节） */
export function passTime(c: Content, st: RunState, y: number): void {
  st.age += y;
  if(st.status.poison) st.lifeBonus -= y;
}

/** 文本模板：{性别:男|女} */
export function fill(st: RunState, text: string, vars: Record<string, string> = {}): string {
  return text
    .replace(/\{性别:([^|}]*)\|([^}]*)\}/g, (_, m, f) => st.gender === 'm' ? m : f)
    .replace(/\{([^{}:]+)\}/g, (all, k) => vars[k] ?? all);
}

export { weighted };
