// 局内存档：每一步之后写进本机存储（systems 13.1）。存储不可用时（无痕模式等）照常能玩，只是不保存
import type { RunState } from '../../src/engine/types.ts';

export interface Saved { v: 1; state: RunState; log: LogLine[] }
export interface LogLine { kind: 'text' | 'event' | 'choice' | 'system'; text: string }

const KEY = 'wendao.run.v1';

export function load(): Saved | null {
  try{ const s = localStorage.getItem(KEY); return s ? JSON.parse(s) as Saved : null; }catch{ return null; }
}
export function save(data: Saved): void {
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch{ /* 存不下就算了 */ }
}
export function clear(): void {
  try{ localStorage.removeItem(KEY); }catch{ /* 同上 */ }
}
