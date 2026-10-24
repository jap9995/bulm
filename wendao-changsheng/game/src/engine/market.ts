// 集市：货架、刷新、买卖价格。规则见 design/market.md
import type { Content, RunState } from './types.ts';
import { mods, stoneCoef } from './calc.ts';
import { chance, int, weighted } from './rng.ts';

/** 每 6 次行动刷新一次；突破到新的大境界后也刷新（market 第二节） */
export function refreshMarket(c: Content, st: RunState): void {
  const cfg = c.market;
  const due = !st.market || st.actions - st.market.refreshedAt >= cfg.refreshEvery || st.flags.marketRealm !== st.realm;
  if(!due) return;
  st.flags.marketRealm = st.realm;
  const m = mods(c, st);
  const shelf: { item: string; stock: number; rare: boolean }[] = [];
  const used = new Set<string>();
  for(const s of cfg.staples){ shelf.push({ item: s.item, stock: s.stock, rare: false }); used.add(s.item); }
  const draw = (pool: typeof cfg.common, rare: boolean) => {
    const cands = pool.filter(p => !used.has(p.item) && !(c.items[p.item]?.kind === 'technique' && st.techniques.includes(c.items[p.item].technique!)));
    const p = weighted(st, 'loot', cands.map(x => ({ value: x, w: x.weight })));
    if(!p) return;
    used.add(p.item);
    shelf.push({ item: p.item, stock: int(st, 'loot', p.stock[0], p.stock[1]), rare });
  };
  const rareP = cfg.rareBase + st.luck * cfg.rarePerLuck;
  for(let i = 0; i < cfg.randomSlots + m.marketSlots; i++){ const r = chance(st, 'loot', rareP); draw(r ? cfg.rare : cfg.common, r); }
  for(let i = 0; i < m.rareSlot; i++) draw(cfg.rare, true);
  if(st.realm === 0 && st.layer >= cfg.foundationPill.fromLayer) shelf.push({ item: cfg.foundationPill.item, stock: cfg.foundationPill.stock, rare: false });
  st.market = { refreshedAt: st.actions, shelf };
}

/** 买入价 = 物品表价格 × 灵石系数 × 价格修正（最低 ×0.5）；筑基丹不乘系数（market 3.1） */
export function priceOf(c: Content, st: RunState, id: string): number {
  const it = c.items[id];
  let mult = mods(c, st).buyMult ?? 1;
  if(st.flags.arenaChampion) mult *= 0.9;
  if(it.kind === 'charm' && st.talents.includes('C15')) mult *= 0.5;
  const sx = st.factions.sanxiu ?? 0;
  if(sx <= -10) mult *= 1.2; else if(sx >= 60) mult *= 0.8; else if(sx >= 30) mult *= 0.9;
  if(st.world.some(w => w.id === 'demon_war')) mult *= 1.5;
  mult = Math.max(0.5, mult);
  const base = it.fixedPrice ?? (it.price ?? 0) * stoneCoef(c, st);
  return Math.round(base * mult);
}

/** 卖出价：物品表写了出售价的用它；否则 买入价基数 × 40%；再乘出售修正。写「不出售」的集市不收（market 3.2） */
export function sellPriceOf(c: Content, st: RunState, id: string): number | null {
  const it = c.items[id];
  if(!it || it.kind === 'breakthrough' || it.kind === 'key') return null;
  if(it.price === null && it.sell === undefined) return null;
  const base = it.sell !== undefined ? it.sell * stoneCoef(c, st) : (it.fixedPrice ?? (it.price ?? 0) * stoneCoef(c, st)) * c.market.sellRatio;
  let mult = mods(c, st).sellMult ?? 1;
  if(st.origin === 'hunter' && it.tags?.includes('beast')) mult *= 1.3;
  return Math.max(1, Math.round(base * mult));
}
