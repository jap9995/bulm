// 《问道长生》网页界面：标题 → 开局 → 一生 → 结局。规则全在引擎里，界面只负责显示和把玩家的点击交给引擎
import { useEffect, useRef, useState } from 'preact/hooks';
import { act, actions, choose, newRun, summary } from '../../src/engine/engine.ts';
import { destinyLine } from '../../src/engine/destiny.ts';
import type { RunState } from '../../src/engine/types.ts';
import { content as c } from './content.ts';
import { Create, type CreateResult } from './Create.tsx';
import { Panels, type PanelId, panelsHere } from './Panels.tsx';
import { Ending } from './Ending.tsx';
import { clear, load, save, type LogLine } from './save.ts';

type Screen = 'title' | 'create' | 'play';

export function App() {
  const saved = useRef(load());
  const [screen, setScreen] = useState<Screen>('title');
  const [st, setSt] = useState<RunState | null>(saved.current?.state ?? null);
  const [log, setLog] = useState<LogLine[]>(saved.current?.log ?? []);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [ad, setAd] = useState<null | (() => void)>(null);

  // 每一步之后存档；一局结束后清掉存档（结局页仍然显示）
  const commit = (next: RunState, lines: LogLine[]) => {
    const all = [...log, ...lines].slice(-300);
    setSt(next); setLog(all);
    if(next.ended) clear(); else save({ v: 1, state: next, log: all });
  };

  const start = (r: CreateResult) => {
    const s = newRun(c, { seed: r.seed, origin: r.origin, talent: r.talent, gender: r.gender, destiny: r.destiny });
    const o = c.origins.find(x => x.id === r.origin)!;
    const lines: LogLine[] = [
      { kind: 'system', text: `${o.name}·${s.name}，十六岁，踏入仙途。` },
      { kind: 'text', text: o.desc },
    ];
    const dl = destinyLine(c, s); if(dl) lines.push({ kind: 'system', text: dl });
    setLog([]); setPanel(null);
    setSt(s); setLog(lines); save({ v: 1, state: s, log: lines });
    setScreen('play');
  };

  const textLines = (texts: string[], s: RunState): LogLine[] => {
    const out: LogLine[] = texts.filter(Boolean).map(t => ({ kind: 'text' as const, text: t }));
    if(s.pending) out.push({ kind: 'event', text: s.pending.text });
    return out;
  };

  const doAct = (id: string) => {
    if(!st) return;
    const r = act(c, st, id);
    commit(r.state, textLines(r.view.text, r.state));
  };

  const doChoose = (index: number) => {
    if(!st?.pending) return;
    const opt = st.pending.options.find(o => o.index === index)!;
    const go = (adWatched: boolean) => {
      const r = choose(c, st, index, { adWatched });
      commit(r.state, [{ kind: 'choice', text: opt.text }, ...textLines(r.view.text, r.state)]);
    };
    // 看广告的选项：先放广告，看完才算数（README 第 5 节第 11 条）。现在是占位，接 TapTap 时换成激励视频
    if(st.pending.event.startsWith('__ad') && index === 0) setAd(() => () => { setAd(null); go(true); });
    else go(false);
  };

  if(screen === 'title') return (
    <div class="title-screen">
      <div class="title-art" aria-hidden="true" />
      <h1>问道长生</h1>
      <p class="title-sub">一生只有一次。修仙，问道，或者死在半路。</p>
      <div class="title-btns">
        {st && !st.ended && <button class="btn primary" onClick={() => setScreen('play')}>继续这一生</button>}
        <button class={`btn ${st && !st.ended ? '' : 'primary'}`} onClick={() => setScreen('create')}>开始新的一生</button>
      </div>
    </div>
  );
  if(screen === 'create') return <Create onDone={start} onBack={() => setScreen('title')} />;
  if(!st) return null;
  if(st.ended) return <Ending st={st} onAgain={() => { setSt(null); setLog([]); setScreen('create'); }} />;

  return (
    <div class="play">
      <Status st={st} />
      <Log lines={log} />
      <div class="dock">
        {st.pending ? <Choices st={st} onChoose={doChoose} /> : <Actions st={st} onAct={doAct} onPanel={setPanel} />}
      </div>
      {panel && <Panels id={panel} st={st} onClose={() => setPanel(null)} onChange={(s, lines) => commit(s, lines.map(t => ({ kind: 'text', text: t })))} />}
      {ad && <AdPlaceholder onDone={ad} onCancel={() => setAd(null)} />}
    </div>
  );
}

// ───────────── 顶部状态栏 ─────────────

function Status({ st }: { st: RunState }) {
  const s = summary(c, st);
  const left = Math.max(0, s.lifespan - s.age);
  const hurt = [st.status.heavy > 0 && '重伤', st.status.light > 0 && '轻伤', st.status.poison && '中毒', st.status.heartDemon && '心魔'].filter(Boolean) as string[];
  const dl = destinyLine(c, st);
  return (
    <header class="status">
      <div class="status-top">
        <span class="name">{s.name}</span>
        <span class="realm">{s.realm}</span>
        <span class="loc">{s.location}</span>
      </div>
      <div class="cult" title={`修为 ${s.cult}%`}><i style={{ width: `${Math.min(100, s.cult)}%` }} /></div>
      <div class="status-row">
        <span>{s.age} 岁</span>
        <span class={left < 15 ? 'warn' : ''}>寿元余 {left} 年</span>
        <span>灵石 {s.stones}</span>
        {hurt.map(h => <span class="hurt" key={h}>{h}</span>)}
      </div>
      {dl && <div class="destiny">{dl}</div>}
    </header>
  );
}

// ───────────── 中间的人生经历 ─────────────

function Log({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [lines.length]);
  return (
    <div class="log" ref={ref}>
      {lines.map((l, i) => <p class={`line ${l.kind}`} key={i}>{l.kind === 'choice' ? `› ${l.text}` : l.text}</p>)}
    </div>
  );
}

// ───────────── 底部：行动或事件选项 ─────────────

const EVENT_NAME: Record<string, string> = { __ad_revive: '生死关头', __ad_relief: '突破失败', __gift: '送礼' };

function Choices({ st, onChoose }: { st: RunState; onChoose: (i: number) => void }) {
  const p = st.pending!;
  const npc = st.flags.__visit ? c.npcs[String(st.flags.__visit)]?.name : '';
  const title = EVENT_NAME[p.event] ?? (p.event === '__visit' ? `拜访${npc}` : c.events[p.event]?.name ?? '');
  return (
    <div class="choices">
      {title && <div class="dock-title">{title}</div>}
      {p.options.map(o => (
        <button key={o.index} class={`opt ${o.fortune ? 'fortune' : ''}`} disabled={!o.enabled} onClick={() => onChoose(o.index)}>
          <b>{o.text}</b>
          <span>{o.enabled ? o.hint : o.reason}</span>
        </button>
      ))}
    </div>
  );
}

function Actions({ st, onAct, onPanel }: { st: RunState; onAct: (id: string) => void; onPanel: (p: PanelId) => void }) {
  const list = actions(c, st);
  const main = list.filter(a => !a.id.startsWith('move:'));
  const moves = list.filter(a => a.id.startsWith('move:'));
  return (
    <div class="actions">
      <div class="act-grid">
        {main.map(a => (
          <button key={a.id} class={`act ${a.id.startsWith('break') ? 'break' : ''}`} disabled={!a.enabled} onClick={() => onAct(a.id)} title={a.reason ?? a.hint}>
            <b>{a.label}</b>
            {(a.reason || a.hint) && <span class={a.hint?.includes('身死道消') ? 'danger' : ''}>{a.enabled ? a.hint : a.reason}</span>}
          </button>
        ))}
      </div>
      <div class="dock-sub">
        <div class="moves">{moves.map(a => <button key={a.id} class="chip" disabled={!a.enabled} title={a.reason} onClick={() => onAct(a.id)}>{a.label.replace('前往', '')}</button>)}</div>
        <div class="tools">{panelsHere(st).map(p => <button key={p.id} class="chip tool" onClick={() => onPanel(p.id)}>{p.label}</button>)}</div>
      </div>
    </div>
  );
}

// 广告占位：接 TapTap 激励视频之前，用三秒倒计时代替
function AdPlaceholder({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [t, setT] = useState(3);
  useEffect(() => { if(t <= 0) return; const id = setTimeout(() => setT(t - 1), 1000); return () => clearTimeout(id); }, [t]);
  return (
    <div class="sheet-back">
      <div class="ad-box">
        <p>广告播放中（占位）</p>
        <div class="ad-count">{t > 0 ? t : '✓'}</div>
        <button class="btn primary" disabled={t > 0} onClick={onDone}>看完了</button>
        <button class="link" onClick={onCancel}>不看了</button>
      </div>
    </div>
  );
}
