// 引擎测试：用 Node 自带的测试工具运行 → node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load.ts';
import { newRun, offerTalents, act, actions, choose } from '../src/engine/engine.ts';
import { step } from '../src/sim/bots.ts';
import { duelP } from '../src/engine/calc.ts';
import type { RunState } from '../src/engine/types.ts';

const c = loadContent();

function playOut(seed: number, kind: 'random' | 'steady' | 'aggressive'): RunState {
  let st = newRun(c, { seed, origin: 'orphan', talent: offerTalents(c, seed)[0] });
  for(let i = 0; i < 1000 && !st.ended; i++) st = step(c, st, { kind, watchAds: true });
  return st;
}

test('内容配置通过引用检查', () => {
  assert.ok(Object.keys(c.events).length > 30);
  assert.ok(c.combat.beast_wolf, '赤目狼妖的斗法文字已导入');
});

test('确定性：同一种子、同样的选择，重放结果完全一致（balance-targets 第八节）', () => {
  for(const seed of [1, 7, 42]){
    const a = playOut(seed, 'random'), b = playOut(seed, 'random');
    assert.deepEqual(a, b);
  }
});

test('不同种子得到不同的人生', () => {
  assert.notDeepEqual(playOut(1, 'steady').log, playOut(2, 'steady').log);
});

test('引擎函数不修改传入的状态', () => {
  const st = newRun(c, { seed: 3, origin: 'merchant', talent: 'R01' });
  const copy = structuredClone(st);
  act(c, st, actions(c, st).find(a => a.id === 'explore')!.id);
  assert.deepEqual(st, copy);
});

test('每一局都能结束，不会死锁，属性不越界', () => {
  for(let seed = 1; seed <= 30; seed++){
    for(const kind of ['random', 'steady', 'aggressive'] as const){
      const st = playOut(seed, kind);
      assert.ok(st.ended, `种子 ${seed}（${kind}）没有结束`);
      assert.ok(st.foundation >= 0 && st.foundation <= 100);
      assert.ok(st.luck >= 0 && st.luck <= 50);
      assert.ok(st.dao >= -100 && st.dao <= 100);
      assert.ok(st.stones >= 0);
    }
  }
});

test('斗法胜率公式（content-expansion 0.2）', () => {
  assert.equal(duelP(28, 40), 0.35);          // systems 1.6 的例子：炼气九层对筑基初期
  assert.equal(duelP(1, 100), 0.05);          // 下限 5%
  assert.equal(duelP(100, 1), 0.95);          // 上限 95%
});

test('看广告复活：每局一次，转为重伤', () => {
  // 找一局会触发复活提示的随机种子
  for(let seed = 1; seed < 400; seed++){
    let st = newRun(c, { seed, origin: 'orphan', talent: 'C01' });
    for(let i = 0; i < 1000 && !st.ended; i++){
      if(st.pending?.event === '__ad_revive'){
        const next = choose(c, st, 0, { adWatched: true }).state;
        assert.equal(next.ads.revive, true);
        assert.ok(next.status.heavy > 0 || next.ended);
        return;
      }
      st = step(c, st, { kind: 'random', watchAds: true });
    }
  }
  assert.fail('没有找到会触发复活提示的局');
});

test('突破失败后修为仍满（看广告免罚）时可以调息，调息后能再次突破', () => {
  const st = newRun(c, { seed: 5, origin: 'orphan', talent: offerTalents(c, 5)[0] });
  st.layer = 9; st.cult = 1; st.breakCooldown = true; st.bag.zhuji_dan = 1;
  // 在建了护山阵的洞府里调息，不会被闭关遇袭打断（misc-rules 第三节）
  st.abode = { since: 16, slots: 3, buildings: { hushan: 1 }, leftAt: 0, fieldReady: null }; st.location = 'abode';
  const before = actions(c, st);
  assert.ok(before.find(a => a.id === 'cultivate')?.enabled, '冷却中修为满时，修炼（调息）可用');
  assert.ok(!before.find(a => a.id === 'break:normal')?.enabled, '冷却中不能突破');
  const after = act(c, st, 'cultivate').state;
  assert.equal(after.breakCooldown, false);
  assert.ok(actions(c, after).find(a => a.id === 'break:normal')?.enabled, '调息后可以突破');
});

test('闭关会被打扰：野外闭关时有时遇袭，重伤时遇到的是更危险的版本；建了护山阵的洞府里不会', () => {
  let wild = 0, hurt = 0, safe = 0;
  for(let seed = 1; seed <= 200; seed++){
    const st = newRun(c, { seed, origin: 'orphan', talent: offerTalents(c, seed)[0] });
    const a = act(c, st, 'cultivate').state; if(a.pending?.event === 'A_ambush') wild++;
    const h = structuredClone(st); h.status.heavy = 2;
    const b = act(c, h, 'cultivate').state; if(b.pending?.event === 'A_ambush_hurt') hurt++;
    const q = structuredClone(st); q.abode = { since: 16, slots: 3, buildings: { hushan: 1 }, leftAt: 0, fieldReady: null }; q.location = 'abode';
    const d = act(c, q, 'cultivate').state; if(d.pending?.event?.startsWith('A_ambush')) safe++;
  }
  assert.ok(wild > 5 && wild < 40, `野外遇袭约一成：${wild}/200`);
  assert.ok(hurt > 5, '重伤时遇袭');
  assert.equal(safe, 0);
});
