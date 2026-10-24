// 宗门：回宗时的晋升、俸禄与宗门事件，藏经阁兑换
// 规则：content-expansion 第三节、systems 第 15 节、event-draw 4.4
import type { Content, RunState } from './types.ts';
import { addItem, checkAll } from './effects.ts';
import { stoneCoef } from './calc.ts';
import { grantAbode } from './abode.ts';
import { chance, weighted } from './rng.ts';

export const sectOfLoc = (c: Content, loc: string) => c.locations[loc]?.sect;

/** 回到宗门：未入门时是入门考核；入门后先晋升、领俸禄，再必定出一个宗门事件 */
export function arrive(c: Content, st: RunState, out: string[]): string | undefined {
  const sid = sectOfLoc(c, st.location)!;
  if(!st.sect){
    if(st.age < Number(st.flags['retake_' + sid] ?? 0)){ out.push('上次考核没过，还得再等些时日。'); return undefined; }
    return c.sects.sects[sid].exam;
  }
  if(st.sect.id !== sid) return undefined;
  autoPromote(c, st, out);
  const s = st.sect;
  if(st.actions - s.stipendAt >= c.sects.stipendGap){
    s.stipendAt = st.actions;
    const n = Math.round(c.sects.ranks[s.rank].stipend * stoneCoef(c, st));
    st.stones += n; out.push(`领了这一期的俸禄，灵石 +${n}。`);
    for(const id of c.sects.sects[sid].stipendItems) addItem(c, st, id, 1, out);
  }
  return sectEvent(c, st);
}

/** 满足条件后自动晋升（systems 15.2）；核心弟子只能通过 S07 */
function autoPromote(c: Content, st: RunState, out: string[]): void {
  const s = st.sect!;
  while(s.rank < c.sects.ranks.length - 1){
    const next = c.sects.ranks[s.rank + 1];
    if(next.byEvent) break;
    const need = next.total * (s.rank === 0 && s.backdoor ? 1.5 : 1);
    const realmOk = st.realm > next.realmGte || (st.realm === next.realmGte && st.layer >= next.layerGte);
    if(s.total < need || !realmOk) break;
    s.rank++;
    out.push(`你晋升为${c.sects.sects[s.id].name}${next.name}。`);
    if(s.rank === 1 && !st.abode){ grantAbode(c, st, out, `${c.sects.sects[s.id].name}分了一座洞府给你`); }
    st.log.push({ age: Math.floor(st.age), type: 'sect', weight: s.rank >= 3 ? 6 : 3, text: `晋升为${c.sects.sects[s.id].name}${next.name}` });
  }
}

/** 回宗事件的顺序（event-draw 4.4）：取第一个可以触发的 */
function sectEvent(c: Content, st: RunState): string {
  const s = st.sect!;
  const ok = (id: string) => !!c.events[id] && checkAll(c, st, c.events[id].conditions) && checkAll(c, st, c.events[id].unlock);
  if(ok('S06')) return 'S06';
  for(const id of ['S08', 'S07']) if(ok(id) && !st.seen[id]) return id;
  if(!s.s03.includes(st.realm)){ s.s03.push(st.realm); return 'S03'; }
  if(s.rank >= 1 && !s.s05.includes(st.realm)){ s.s05.push(st.realm); return 'S05'; }
  if(chance(st, 'event', 0.25)){
    const cands = ['D04', 'D06', 'S04'].filter(id => ok(id) && !st.seen[id]);
    const id = weighted(st, 'event', cands.map(x => ({ value: x, w: 1 })));
    if(id) return id;
  }
  return 'S02';
}

/** 藏经阁：本宗和通用条目（systems 15.4） */
export function library(c: Content, st: RunState): { item: string; rank: number; cost: number; enabled: boolean; reason?: string }[] {
  if(!st.sect || sectOfLoc(c, st.location) !== st.sect.id) return [];
  const s = st.sect;
  return [...(c.sects.library[s.id] ?? []), ...c.sects.library.common].map(e => {
    const reason = s.rank < e.rank ? `需要${c.sects.ranks[e.rank].name}` : s.avail < e.cost ? `可用贡献不足（需要 ${e.cost}）` : undefined;
    return { ...e, enabled: !reason, reason };
  });
}

export function exchange(c: Content, st0: RunState, item: string): RunState {
  const st = structuredClone(st0);
  const e = library(c, st).find(x => x.item === item);
  if(!e || !e.enabled) throw new Error('不能兑换：' + item);
  st.sect!.avail -= e.cost;
  addItem(c, st, item, 1, []);
  return st;
}
