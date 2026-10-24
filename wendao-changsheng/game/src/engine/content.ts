// 组装内容配置并检查引用。引用了不存在的事件、物品、功法、斗法文字时直接报错，不静默跳过（balance-targets 第八节）
// 这里不读文件：浏览器里由打包工具把 JSON 引进来，Node 里由 scripts/load.ts 读文件，两边都调用 buildContent
import type { Content, Effect, EventDef, Item, Origin, Realm, SpecialDef, Talent, Technique, CombatText, Location, MarketConfig, Cond, SectConfig } from './types.ts';

export interface RawContent {
  realms: Realm[]; origins: Origin[]; talents: Talent[];
  items: Record<string, Omit<Item, 'id'>>; techniques: Record<string, Omit<Technique, 'id'>>;
  world: { locations: Record<string, Omit<Location, 'id'>>; market: MarketConfig; names: Content['names']; specials: SpecialDef[] };
  sects: SectConfig;
  events: EventDef[][];
  combat: Record<string, CombatText>[];
}

export function buildContent(raw: RawContent): Content {
  const withId = <T>(rec: Record<string, any>): Record<string, T> => Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, { id, ...v }]));
  const c: Content = {
    realms: raw.realms, origins: raw.origins, talents: raw.talents,
    items: withId<Item>(raw.items), techniques: withId<Technique>(raw.techniques),
    locations: withId<Location>(raw.world.locations),
    events: {}, combat: Object.assign({}, ...raw.combat),
    specials: raw.world.specials, market: raw.world.market, sects: raw.sects, names: raw.world.names,
  };
  for(const list of raw.events) for(const ev of list){
    if(c.events[ev.id]) throw new Error(`事件 ID 重复：${ev.id}`);
    c.events[ev.id] = ev;
  }
  const errors = validate(c);
  if(errors.length) throw new Error('内容配置有误：\n  ' + errors.join('\n  '));
  return c;
}

/** 检查所有引用；返回错误列表 */
export function validate(c: Content): string[] {
  const err: string[] = [];
  const item = (id: string, where: string) => { if(!c.items[id]) err.push(`${where}：物品 ${id} 不存在`); };
  const tagged = (tag: string, where: string) => { if(!Object.values(c.items).some(i => i.tags?.includes(tag))) err.push(`${where}：没有带标签 ${tag} 的物品`); };
  const event = (id: string, where: string) => { if(!id.startsWith('@') && !c.events[id]) err.push(`${where}：事件 ${id} 不存在`); };
  const effects = (list: Effect[] | undefined, where: string) => {
    for(const e of list ?? []){
      if('item' in e) item(e.item, where);
      if('randomItem' in e) tagged(e.randomItem, where);
      if('chain' in e) event(e.chain, where);
      if('schedule' in e) event(e.schedule, where);
      if('ready' in e) event(e.ready, where);
      if('learn' in e && !c.techniques[e.learn]) err.push(`${where}：功法 ${e.learn} 不存在`);
    }
  };
  const conds = (list: Cond[] | undefined, where: string) => {
    for(const x of list ?? []){
      if('hasItem' in x) item(x.hasItem, where);
      if('technique' in x && !c.techniques[x.technique]) err.push(`${where}：功法 ${x.technique} 不存在`);
      if('seen' in x) event(x.seen, where);
      if('anyOf' in x) conds(x.anyOf, where);
    }
  };
  const locs = new Set([...Object.keys(c.locations), 'any', 'explore', 'secret', 'sect']);
  for(const ev of Object.values(c.events)){
    const w = `事件 ${ev.id}`;
    for(const l of ev.locations) if(!locs.has(l)) err.push(`${w}：地点 ${l} 不存在`);
    if(ev.combat && ev.combat !== '@beast' && !c.combat[ev.combat]) err.push(`${w}：斗法文字 ${ev.combat} 不存在`);
    if(!ev.options.length) err.push(`${w}：没有选项`);
    conds(ev.conditions, w); conds(ev.unlock, w);
    ev.options.forEach((o, i) => {
      const wo = `${w} 选项 ${i + 1}`;
      conds(o.requires, wo); effects(o.cost, wo);
      const r = o.result;
      if(r.type === 'fixed') effects(r.effects, wo);
      if(r.type === 'chance'){ effects(r.success.effects, wo); effects(r.fail.effects, wo); }
      if(r.type === 'duel') for(const b of Object.values(r.tiers ?? {})) effects(b?.effects, wo);
    });
  }
  for(const r of c.realms) if(r.material) item(r.material, `境界 ${r.name}`);
  for(const o of c.origins){ for(const id of Object.keys(o.items ?? {})) item(id, `出身 ${o.name}`); for(const id of o.equip ?? []) item(id, `出身 ${o.name}`); }
  for(const [id, it] of Object.entries(c.items)){ effects(it.use, `物品 ${id}`); if(it.technique && !c.techniques[it.technique]) err.push(`物品 ${id}：功法 ${it.technique} 不存在`); }
  const m = c.market;
  for(const s of m.staples) item(s.item, '集市常备货');
  for(const s of [...m.common, ...m.rare]) item(s.item, '集市货池');
  item(m.foundationPill.item, '集市筑基丹');
  if(!Object.values(c.combat).some(t => t.locations?.length)) err.push('没有可重复妖兽的斗法文字（W01 需要）');
  for(const [id, s] of Object.entries(c.sects.sects)){
    event(s.exam, `宗门 ${id}`);
    if(c.locations[s.location]?.sect !== id) err.push(`宗门 ${id}：地点 ${s.location} 没有标记 sect`);
    for(const it of s.stipendItems) item(it, `宗门 ${id} 俸禄`);
  }
  for(const [id, list] of Object.entries(c.sects.library)){ if(id !== 'common' && !c.sects.sects[id]) err.push(`藏经阁：宗门 ${id} 不存在`); for(const e of list) item(e.item, `藏经阁 ${id}`); }
  for(const id of ['S02', 'S03', 'S05', 'S_hunt']) event(id, '宗门');
  return err;
}
