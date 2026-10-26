// 结局：这一生的总结（传记卡后面用 Canvas 单独做，systems 第 5 节）
import { summary } from '../../src/engine/engine.ts';
import type { RunState } from '../../src/engine/types.ts';
import { content as c } from './content.ts';

const CAUSE: Record<string, string> = {
  heavy_again: '重伤未愈，再遭重创', tribulation: '渡劫失败，形神俱灭', breakthrough: '冲关失败', poison: '毒发', lifespan: '寿元耗尽',
};

export function Ending({ st, onAgain }: { st: RunState; onAgain: () => void }) {
  const s = summary(c, st);
  const death = st.ended?.ending === 'death';
  const title = death ? '身死道消' : st.ended?.ending === 'retire' ? '坐化' : '寿终正寝';
  // 人生日志按分量挑最重要的十条，再按年纪排回去
  const lines = [...st.log].sort((a, b) => b.weight - a.weight).slice(0, 10).sort((a, b) => a.age - b.age);
  return (
    <div class="ending">
      <div class={`seal ${death ? 'dead' : ''}`}>{title}</div>
      <h2>{s.name}</h2>
      <p class="ending-sub">{s.origin} · 享年 {s.age} 岁 · {s.realm}{death && st.ended?.cause ? ` · ${CAUSE[st.ended.cause] ?? st.ended.cause}` : ''}</p>
      <ol class="life">
        {lines.map((l, i) => <li key={i}><em>{l.age} 岁</em>{l.text.replace(/^\d+岁/, '')}</li>)}
      </ol>
      <button class="btn primary" onClick={onAgain}>再活一世</button>
    </div>
  );
}
