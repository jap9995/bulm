// 种子随机数：四条独立的流（systems 7.1）——事件抽取、判定骰子、掉落、文字。
// 每条流的状态存在 RunState.rng 里，随存档保存；同一种子、同样的选择一定得到同样的结果。
import type { RunState, StreamName } from './types.ts';

const STREAMS: StreamName[] = ['event', 'check', 'loot', 'text'];

function mix(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) | 0;
}

export function seedStreams(seed: number): Record<StreamName, number> {
  const r = {} as Record<StreamName, number>;
  STREAMS.forEach((s, i) => { r[s] = mix(seed * 31 + i * 0x9e3779b9); });
  return r;
}

/** mulberry32：返回 [0, 1) */
export function rand(st: Pick<RunState, 'rng'>, s: StreamName): number {
  const a = (st.rng[s] = (st.rng[s] + 0x6d2b79f5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(st: Pick<RunState, 'rng'>, s: StreamName, p: number): boolean { return rand(st, s) < p; }
export function int(st: Pick<RunState, 'rng'>, s: StreamName, lo: number, hi: number): number { return lo + Math.floor(rand(st, s) * (hi - lo + 1)); }
export function pick<T>(st: Pick<RunState, 'rng'>, s: StreamName, arr: T[]): T { return arr[Math.floor(rand(st, s) * arr.length)]; }

export function weighted<T>(st: Pick<RunState, 'rng'>, s: StreamName, items: { value: T; w: number }[]): T | undefined {
  const pool = items.filter(i => i.w > 0);
  const total = pool.reduce((a, b) => a + b.w, 0);
  if(total <= 0) return undefined;
  let r = rand(st, s) * total;
  for(const i of pool){ r -= i.w; if(r < 0) return i.value; }
  return pool[pool.length - 1].value;
}
