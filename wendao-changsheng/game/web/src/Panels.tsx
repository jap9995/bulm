// 不耗时的面板：背包（服药、装备、出售）、集市、藏经阁、洞府建造
import { buy, equip, sell, usePill } from '../../src/engine/engine.ts';
import { priceOf, sellPriceOf } from '../../src/engine/market.ts';
import { exchange, library } from '../../src/engine/sect.ts';
import { build, buildings, buyAbode, expand, expandCost } from '../../src/engine/abode.ts';
import { stoneCoef } from '../../src/engine/calc.ts';
import type { RunState } from '../../src/engine/types.ts';
import { content as c } from './content.ts';

export type PanelId = 'bag' | 'market' | 'library' | 'abode';

/** 当前地点能打开哪些面板 */
export function panelsHere(st: RunState): { id: PanelId; label: string }[] {
  const out: { id: PanelId; label: string }[] = [{ id: 'bag', label: '背包' }];
  if(st.location === 'market') out.push({ id: 'market', label: '货架' });
  if(st.sect && c.locations[st.location]?.sect === st.sect.id) out.push({ id: 'library', label: '藏经阁' });
  if(st.location === 'abode') out.push({ id: 'abode', label: '营造' });
  return out;
}

const GRADE: Record<string, string> = { yellow: '黄阶', mystic: '玄阶', earth: '地阶', heaven: '天阶' };
const SLOT: Record<string, string> = { weapon: '武器', armor: '护甲', accessory: '饰品' };

type Change = (st: RunState, lines: string[]) => void;

export function Panels({ id, st, onClose, onChange }: { id: PanelId; st: RunState; onClose: () => void; onChange: Change }) {
  // 引擎拒绝时（钱不够、背包满）把原因显示出来，而不是让界面崩掉
  const tryDo = (f: () => RunState | { state: RunState; lines: string[] }, ok: string) => {
    try{ const r = f(); if('state' in r) onChange(r.state, r.lines.length ? r.lines : [ok]); else onChange(r, [ok]); }
    catch(e){ onChange(st, [String((e as Error).message)]); }
  };
  return (
    <div class="sheet-back" onClick={onClose}>
      <div class="sheet" onClick={e => e.stopPropagation()}>
        <header class="sheet-head"><h3>{{ bag: '背包', market: '集市货架', library: '藏经阁', abode: '洞府营造' }[id]}</h3><button class="link" onClick={onClose}>收起</button></header>
        <div class="sheet-body">
          {id === 'bag' && <Bag st={st} tryDo={tryDo} />}
          {id === 'market' && <Market st={st} tryDo={tryDo} />}
          {id === 'library' && <Library st={st} tryDo={tryDo} />}
          {id === 'abode' && <Abode st={st} tryDo={tryDo} />}
        </div>
      </div>
    </div>
  );
}

type TryDo = (f: () => RunState | { state: RunState; lines: string[] }, ok: string) => void;

function Bag({ st, tryDo }: { st: RunState; tryDo: TryDo }) {
  const ids = Object.keys(st.bag).filter(id => st.bag[id] > 0);
  const keys = Object.keys(st.keyItems).filter(id => st.keyItems[id] > 0);
  return (
    <>
      <div class="equip-row">
        {(['weapon', 'armor', 'accessory'] as const).map(s => <div class="equip" key={s}><em>{SLOT[s]}</em>{st.equip[s] ? c.items[st.equip[s]!].name : '—'}</div>)}
      </div>
      {!ids.length && <p class="empty">背包是空的。</p>}
      {ids.map(id => { const it = c.items[id]; const sp = st.location === 'market' ? sellPriceOf(c, st, id) : null; return (
        <div class="item" key={id}>
          <div><b>{it.name}</b><span>{GRADE[it.grade] ?? ''} ×{st.bag[id]}</span></div>
          <div class="item-btns">
            {it.use && <button class="chip" onClick={() => tryDo(() => usePill(c, st, id), `服下了${it.name}。`)}>服用</button>}
            {it.slot && <button class="chip" onClick={() => tryDo(() => equip(c, st, id), `换上了${it.name}。`)}>装备</button>}
            {sp !== null && <button class="chip" onClick={() => tryDo(() => sell(c, st, id), `卖出${it.name}，灵石 +${sp}。`)}>卖 {sp}</button>}
          </div>
        </div>
      ); })}
      {keys.length > 0 && <><h4>要物</h4>{keys.map(id => <div class="item" key={id}><div><b>{c.items[id].name}</b><span>×{st.keyItems[id]}</span></div></div>)}</>}
    </>
  );
}

function Market({ st, tryDo }: { st: RunState; tryDo: TryDo }) {
  const abodePrice = Math.round(c.abode.price * stoneCoef(c, st));
  return (
    <>
      {(st.market?.shelf ?? []).map(s => { const it = c.items[s.item], p = priceOf(c, st, s.item); return (
        <div class={`item ${s.rare ? 'rare' : ''}`} key={s.item}>
          <div><b>{it.name}</b><span>{GRADE[it.grade] ?? ''} · 余 {s.stock}</span></div>
          <button class="chip" disabled={s.stock <= 0 || st.stones < p} onClick={() => tryDo(() => buy(c, st, s.item), `买下${it.name}，灵石 -${p}。`)}>买 {p}</button>
        </div>
      ); })}
      {!st.abode && <div class="item"><div><b>一座洞府</b><span>在洞府里闭关修为更高，还能建灵田</span></div>
        <button class="chip" disabled={st.stones < abodePrice} onClick={() => tryDo(() => buyAbode(c, st), '你在坊市买下了一座洞府。')}>买 {abodePrice}</button></div>}
    </>
  );
}

function Library({ st, tryDo }: { st: RunState; tryDo: TryDo }) {
  return (
    <>
      <p class="note">可用贡献 {st.sect?.avail ?? 0} · 累计 {st.sect?.total ?? 0}</p>
      {library(c, st).map(e => (
        <div class="item" key={e.item}>
          <div><b>{c.items[e.item].name}</b><span>{e.reason ?? `${e.cost} 贡献`}</span></div>
          <button class="chip" disabled={!e.enabled} onClick={() => tryDo(() => exchange(c, st, e.item), `换得${c.items[e.item].name}。`)}>兑换</button>
        </div>
      ))}
    </>
  );
}

function Abode({ st, tryDo }: { st: RunState; tryDo: TryDo }) {
  const ec = expandCost(c, st);
  const used = Object.keys(st.abode?.buildings ?? {}).length;
  return (
    <>
      <p class="note">建筑位 {used} / {st.abode?.slots ?? 0}</p>
      {buildings(c, st).map(b => (
        <div class="item" key={b.id}>
          <div><b>{b.name}{b.level ? ` · ${b.level} 级` : ''}</b><span>{b.reason ?? b.desc}</span></div>
          <button class="chip" disabled={!b.enabled} onClick={() => tryDo(() => build(c, st, b.id), `${b.level ? '升级' : '建起'}了${b.name}。`)}>{b.level ? '升级' : '建造'} {b.cost}</button>
        </div>
      ))}
      {ec !== null && <div class="item"><div><b>扩建</b><span>多一个建筑位</span></div>
        <button class="chip" disabled={st.stones < ec} onClick={() => tryDo(() => expand(c, st), '洞府扩建好了。')}>扩建 {ec}</button></div>}
    </>
  );
}
