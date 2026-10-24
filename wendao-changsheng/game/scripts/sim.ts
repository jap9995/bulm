// 模拟上千局，对照 design/balance-targets.md 的指标
// 用法：node scripts/sim.ts [每组局数=200] [机器人=steady,random,aggressive]
//       node scripts/sim.ts 1 steady --log       （打印一局的完整过程）
import { loadContent } from './load.ts';
import { newRun, offerTalents } from '../src/engine/engine.ts';
import { step, type BotKind } from '../src/sim/bots.ts';
import type { RunState } from '../src/engine/types.ts';

const c = loadContent();
const N = Number(process.argv[2] ?? 200);
const bots = (process.argv[3] ?? 'steady,random,aggressive').split(',') as BotKind[];
const showLog = process.argv.includes('--log');
const origins = c.origins.filter(o => o.unlocked).map(o => o.id);
const RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legend: 3 };

function play(seed: number, origin: string, kind: BotKind, watchAds: boolean): RunState {
  const offers = offerTalents(c, seed);
  const talent = kind === 'random' ? offers[seed % offers.length] : offers.sort((a, b) => RANK[c.talents.find(t => t.id === b)!.rarity] - RANK[c.talents.find(t => t.id === a)!.rarity])[0];
  let st = newRun(c, { seed, origin, talent });
  for(let i = 0; i < 1000 && !st.ended; i++){
    const before = st.steps;
    st = step(c, st, { kind, watchAds });
    if(st.steps === before) throw new Error('机器人没有前进（死锁）');
    if(st.steps > 400){ st.ended = { ending: 'timeout' }; break; }   // balance-targets 第八节：时长上限
  }
  return st;
}

const pct = (n: number, d: number) => d ? (n / d * 100).toFixed(1) + '%' : '-';
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

if(showLog){
  const st = play(1, origins[0], bots[0], true);
  console.log(st.log.map(l => `${l.age}岁　${l.text}`).join('\n'));
  console.log(`\n${st.steps} 次决策，最高境界 ${c.realms[st.realm].name}，结局 ${st.ended?.ending}${st.ended?.cause ? '（' + st.ended.cause + '）' : ''}`);
  process.exit(0);
}

for(const kind of bots){
  const runs: RunState[] = [];
  const t0 = Date.now();
  for(const origin of origins) for(let i = 0; i < N; i++) runs.push(play(i + 1, origin, kind, kind !== 'random'));
  const realmDist = c.realms.map((r, i) => `${r.name} ${pct(runs.filter(s => s.realm === i).length, runs.length)}`).filter(s => !s.endsWith(' 0.0%'));
  const deaths = runs.filter(s => s.ended?.ending === 'death');
  const causes: Record<string, number> = {};
  for(const s of deaths) causes[s.ended!.cause ?? '?'] = (causes[s.ended!.cause ?? '?'] ?? 0) + 1;
  const duels = runs.reduce((a, s) => a + s.stats.duels, 0), wins = runs.reduce((a, s) => a + s.stats.duelWins, 0);
  const explores = runs.reduce((a, s) => a + s.stats.explores, 0), calm = runs.reduce((a, s) => a + s.stats.calm, 0);
  console.log(`\n══ ${kind}：${runs.length} 局（${origins.length} 种出身 × ${N}），用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  console.log(`决策次数　中位数 ${median(runs.map(s => s.steps))}，90% 分位 ${[...runs.map(s => s.steps)].sort((a, b) => a - b)[Math.floor(runs.length * 0.9)]}`);
  console.log(`最高境界　${realmDist.join('　')}`);
  console.log(`结局　　　身死道消 ${pct(deaths.length, runs.length)}　寿终 / 坐化 ${pct(runs.filter(s => s.ended?.ending === 'natural').length, runs.length)}　超时 ${runs.filter(s => s.ended?.ending === 'timeout').length}`);
  console.log(`死因　　　${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, deaths.length)}`).join('　') || '-'}`);
  console.log(`享年　　　中位数 ${median(runs.map(s => Math.floor(s.age)))} 岁；30 岁前死亡 ${pct(runs.filter(s => s.age < 30 && s.ended?.ending === 'death').length, runs.length)}`);
  console.log(`斗法　　　胜率 ${pct(wins, duels)}（${duels} 场）；平静事件占探索 ${pct(calm, explores)}；平均看广告 ${(runs.reduce((a, s) => a + s.stats.adsWatched, 0) / runs.length).toFixed(2)} 次`);
  const inSect = runs.filter(s => s.sect), everSect = runs.filter(s => s.sect || s.flags.hunted);
  const ranks = c.sects.ranks.map((r, i) => `${r.name} ${pct(inSect.filter(s => s.sect!.rank === i).length, runs.length)}`).filter(s => !s.endsWith(' 0.0%'));
  console.log(`宗门　　　入过宗门 ${pct(everSect.length, runs.length)}，被除名 ${pct(runs.filter(s => s.flags.hunted).length, runs.length)}；结束时 ${ranks.join('　') || '-'}`);
  const npcLine = Object.values(c.npcs).map(n => {
    const met = runs.filter(s => s.npcs[n.id]?.met);
    const stages = Object.values(n.stages).map(ev => pct(runs.filter(s => s.seen[ev]).length, runs.length)).join('/');
    return `${n.name} ${pct(met.length, runs.length)}${stages ? `（阶段 ${stages}）` : ''}`;
  });
  console.log(`NPC　　　认识的比例：${npcLine.join('　')}`);
  for(const origin of origins){
    const rs = runs.filter(s => s.origin === origin);
    console.log(`　${c.origins.find(o => o.id === origin)!.name}：筑基以上 ${pct(rs.filter(s => s.realm >= 1).length, rs.length)}，身死 ${pct(rs.filter(s => s.ended?.ending === 'death').length, rs.length)}，享年中位数 ${median(rs.map(s => Math.floor(s.age)))}`);
  }
}
