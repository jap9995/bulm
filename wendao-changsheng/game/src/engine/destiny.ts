// 本局宿命：开局二选一，三步推进，完成或未竟都写进人生日志（systems 第 4 节）
import type { Content, RunState } from './types.ts';
import { apply, checkAll } from './effects.ts';
import { rand } from './rng.ts';

/** 开局给出的两个宿命（同一种子结果固定） */
export function offerDestinies(c: Content, seed: number, origin: string): string[] {
  const pool = c.destinies.filter(d => d.unlocked && (!d.origin || d.origin === origin));
  const forced = c.destinies.find(d => d.forOrigin === origin);
  const s = { rng: { event: seed * 31 + 7, check: 0, loot: 0, text: 0 } } as unknown as RunState;
  const out: string[] = forced ? [forced.id] : [];
  while(out.length < 2 && out.length < pool.length){
    const d = pool[Math.floor(rand(s, 'event') * pool.length)];
    if(!out.includes(d.id)) out.push(d.id);
  }
  return out;
}

export function startDestiny(c: Content, st: RunState, id: string): void {
  const d = c.destinies.find(x => x.id === id); if(!d) throw new Error('未知宿命：' + id);
  st.destiny = { id, step: 0, state: 'active' };
  if(d.start) st.queue.push({ event: d.start, due: 1, prio: 1 });   // 开局的引子：第一次行动后出现
}

/** 每次行动后推进：满足当前一步就进到下一步（一次可以连过几步），过了期限就未竟 */
export function advanceDestiny(c: Content, st: RunState, out: string[]): void {
  const ds = st.destiny; if(!ds || ds.state !== 'active') return;
  const d = c.destinies.find(x => x.id === ds.id)!;
  while(ds.step < d.steps.length){
    const s = d.steps[ds.step];
    if(s.before !== undefined && st.age >= s.before){ fail(c, st, out); return; }
    if(!checkAll(c, st, s.cond)) break;
    ds.step++;
    if(ds.id === 'F16' && ds.step === 2){
      st.flags.homeAge = st.age;
      // 归乡：40 岁前回去才算完成；40–60 岁回去只来得及陪母亲走完最后几年，奖励减半，记为未竟（systems 4.2）
      if(st.age >= 40){
        ds.state = 'failed';
        apply(c, st, [{ stat: 'mood', add: 15 }], out);
        out.push(`你回来得晚了些。母亲已经很老了，你陪她走完了最后几年。宿命「${d.name}」未竟。`);
        st.log.push({ age: Math.floor(st.age), type: 'destiny', weight: 7, text: `宿命「${d.name}」：回来晚了，只陪母亲走完了最后几年` });
        return;
      }
    }
    if(ds.step < d.steps.length) out.push(`宿命 · ${d.name}（${ds.step}/${d.steps.length}）：${d.steps[ds.step].desc}`);
  }
  if(ds.step >= d.steps.length){
    ds.state = 'done';
    out.push(`宿命「${d.name}」已了——${d.done}。`);
    apply(c, st, d.doneEffects, out);
    if(ds.id === 'F16') apply(c, st, [{ stat: 'mood', add: 30 }], out);   // 四十岁前回去，为母亲尽孝送终
    st.log.push({ age: Math.floor(st.age), type: 'destiny', weight: 9, text: `宿命「${d.name}」：${d.done}` });
    return;
  }
  if(d.deadline !== undefined && st.age >= d.deadline) fail(c, st, out);
}

function fail(c: Content, st: RunState, out: string[]): void {
  const ds = st.destiny!, d = c.destinies.find(x => x.id === ds.id)!;
  ds.state = 'failed';
  out.push(`宿命「${d.name}」未竟：${d.fail}。`);
  apply(c, st, d.failEffects, out);
  st.log.push({ age: Math.floor(st.age), type: 'destiny', weight: 7, text: `宿命「${d.name}」未竟：${d.fail}` });
}

/** 一局结束时还没完成的宿命记为未竟 */
export function closeDestiny(c: Content, st: RunState): void {
  if(st.destiny?.state === 'active') fail(c, st, []);
}

/** 状态栏下方的宿命进度行 */
export function destinyLine(c: Content, st: RunState): string | null {
  const ds = st.destiny; if(!ds) return null;
  const d = c.destinies.find(x => x.id === ds.id)!;
  if(ds.state === 'done') return `宿命 · ${d.name}：已完成`;
  if(ds.state === 'failed') return `宿命 · ${d.name}：未竟`;
  return `宿命 · ${d.name}（${ds.step}/${d.steps.length}）：${d.steps[ds.step].desc}`;
}
