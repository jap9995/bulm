// 开局：性别 → 出身 → 天赋（三选一）→ 宿命（二选一）（systems 4.1、content-expansion 第一、二节）
import { useMemo, useState } from 'preact/hooks';
import { offerTalents } from '../../src/engine/engine.ts';
import { offerDestinies } from '../../src/engine/destiny.ts';
import { content as c } from './content.ts';

export interface CreateResult { seed: number; gender: 'm' | 'f'; origin: string; talent: string; destiny: string }

const RARITY: Record<string, string> = { common: '普通', rare: '稀有', epic: '史诗', legend: '传说' };

export function Create({ onDone, onBack }: { onDone: (r: CreateResult) => void; onBack: () => void }) {
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));   // 只用来定这一局的种子，局内随机全在引擎里
  const [gender, setGender] = useState<'m' | 'f' | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [talent, setTalent] = useState<string | null>(null);
  const talents = useMemo(() => offerTalents(c, seed), [seed]);
  const destinies = useMemo(() => origin ? offerDestinies(c, seed, origin) : [], [seed, origin]);
  const origins = c.origins.filter(o => o.unlocked);

  if(!gender) return (
    <Step title="此生为何人" onBack={onBack}>
      <div class="pick-row">
        <button class="pick big" onClick={() => setGender('m')}>男</button>
        <button class="pick big" onClick={() => setGender('f')}>女</button>
      </div>
    </Step>
  );
  if(!origin) return (
    <Step title="出身" onBack={() => setGender(null)}>
      {origins.map(o => (
        <button class="pick" key={o.id} onClick={() => setOrigin(o.id)}>
          <b>{o.name}</b><span>{o.desc}</span>
        </button>
      ))}
    </Step>
  );
  if(!talent) return (
    <Step title="天赋 · 三选一" onBack={() => setOrigin(null)}>
      {talents.map(id => { const t = c.talents.find(x => x.id === id)!; return (
        <button class={`pick rarity-${t.rarity}`} key={id} onClick={() => setTalent(id)}>
          <b>{t.name}<em>{RARITY[t.rarity]}</em></b><span>{t.desc}</span>
        </button>
      ); })}
    </Step>
  );
  return (
    <Step title="宿命 · 二选一" onBack={() => setTalent(null)}>
      {destinies.map(id => { const d = c.destinies.find(x => x.id === id)!; return (
        <button class="pick" key={id} onClick={() => onDone({ seed, gender, origin, talent, destiny: id })}>
          <b>{d.name}</b>
          <span>{d.steps.map(s => s.desc).filter(Boolean).join(' → ')}{d.deadline ? `（${d.deadline} 岁前）` : ''}</span>
        </button>
      ); })}
    </Step>
  );
}

function Step({ title, onBack, children }: { title: string; onBack: () => void; children: preact.ComponentChildren }) {
  return (
    <div class="create">
      <header class="create-head"><button class="link" onClick={onBack}>‹ 返回</button><h2>{title}</h2></header>
      <div class="create-list">{children}</div>
    </div>
  );
}
