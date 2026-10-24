// 把 design/combat-texts.md 第二、四、五、六节的斗法文字转成 content/combat/imported.json
// 两种写法都支持：
//   A. 「| 片段 | 文字 |」表格：起 ①、交锋 · 正面迎战 〔天生神力〕、大胜 ②、余韵 · 胜 ①、逃跑 · 成功 ①
//   B. 小标题 **起** / **交锋** / **结果** / **余韵** / **逃跑**，下面是编号列表或表格，单元格里用 ① ② 和 <br> 分条
// 用法：node scripts/import-combat.ts        （设计文档改了文字之后重跑一次即可）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'design', 'combat-texts.md');
const OUT = path.join(HERE, '..', 'content', 'combat', 'imported.json');

const APPROACH: Record<string, string> = { 正面迎战: 'fight', 施展功法: 'technique', 借助道具: 'item', 利用环境: 'env', 交涉: 'talk', 游说: 'talk', 破财消灾: 'talk' };
const TIER: Record<string, string> = { 大胜: 'big', 险胜: 'win', 落败: 'lose', 惨败: 'bad' };

// 引擎里用的 ID、{敌人} 的称呼、可重复妖兽的出没地点和特性（combat-texts 1.4）
const META: Record<string, { id: string; enemy?: string; locations?: string[]; traits?: Record<string, number | boolean> }> = {
  'W01 遭遇妖兽 · 赤目狼妖': { id: 'beast_wolf', enemy: '赤目狼妖', locations: ['wilds', 'valley'], traits: { pack: 0.2 } },
  'NPC 06 赵承霄 · 当众羞辱': { id: 'zhao_insult', enemy: '赵承霄' },
  '6.1': { id: 'beast_boar', enemy: '铁背山猪', locations: ['wilds', 'valley'], traits: { thickHide: true } },
  '6.2': { id: 'beast_python', enemy: '青鳞蟒', locations: ['wilds', 'valley', 'secret'], traits: { venom: true } },
  '6.3': { id: 'beast_ape', enemy: '雪原白猿', locations: ['secret'], traits: { brute: true } },
  '6.4': { id: 'beast_crows', enemy: '火鸦群', locations: ['secret'], traits: { swift: true } },
  '6.5': { id: 'bandit', enemy: '劫修' },
};

const md = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const chapters = md.split(/\n(?=## )/);
const wanted = chapters.filter(ch => /^## (二|四|五|六)、/.test(ch)).join('\n');
const sections = wanted.split(/\n(?=### )/).filter(s => s.startsWith('### '));
const out: Record<string, any> = {};
const unknown = new Set<string>();

const splitCell = (cell: string) => cell.split(/<br>/).map(s => s.replace(/^[①②③④⑤⑥]\s*/, '').trim()).filter(Boolean);
const tagsOf = (label: string) => { const m = label.match(/〔([^〕]+)〕/); return m ? m[1].split(/\s*\/\s*/) : []; };
const bareOf = (label: string) => label.replace(/〔[^〕]+〕/g, '').replace(/[①②③④⑤⑥]/g, '').trim();
function push(target: any[], text: string, tags: string[]){
  if(!tags.length) target.push(text);
  else if(tags.length === 1) target.push({ tags, text });
  else for(const t of tags) target.push({ tags: [t], text });   // 「轻伤 / 重伤」：满足任一即可
}

for(const sec of sections){
  const head = sec.split('\n')[0].replace(/^###\s*/, '');
  const numM = head.match(/^(\d+\.\d+)\s*/);
  const name = head.replace(/^\d+\.\d+\s*/, '').replace(/（.*$/, '').trim();
  const meta = META[numM?.[1] ?? ''] ?? META[name] ?? { id: numM ? 'c' + numM[1].replace('.', '_') : name };
  const t: any = { id: meta.id, name, enemy: meta.enemy, locations: meta.locations, traits: meta.traits, open: [], clash: {}, result: { big: [], win: [], lose: [], bad: [] }, after: { win: [], lose: [] }, flee: { ok: [], fail: [] } };
  let block = '', variant = '';
  for(const raw of sec.split('\n').slice(1)){
    const line = raw.trim();
    const blk = line.match(/^\*\*(起|交锋|结果|余韵|逃跑)\*\*$/); if(blk){ block = blk[1]; continue; }
    const vb = line.match(/^\*\*〔([^〕]+)〕变体\*\*/); if(vb){ variant = vb[1]; block = ''; continue; }
    if(block === '起'){ const m = line.match(/^\d+\.\s*(.+)$/); if(m){ const tags = tagsOf(m[1]); push(t.open, m[1].replace(/^〔[^〕]+〕\s*/, ''), tags); } continue; }
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if(!row || ['片段', '应对方式', '档位', '胜负', '结果'].includes(row[1]) || /^-+$/.test(row[1])) continue;
    const label = row[1], tags = tagsOf(label), bare = bareOf(label);
    let cell = row[2];
    // 写法 B：按当前小标题解释每一行
    if(block){
      let target: any[] | undefined;
      if(block === '交锋'){ const a = APPROACH[bare]; if(a) target = (t.clash[a] ??= []); }
      else if(block === '结果') target = TIER[bare] ? t.result[TIER[bare]] : undefined;
      else if(block === '余韵') target = bare === '胜' ? t.after.win : bare === '败' ? t.after.lose : undefined;
      else if(block === '逃跑'){ if(bare === '失败') cell = cell.replace(/^.*?片段改用：/, ''); target = bare === '成功' ? t.flee.ok : bare === '失败' ? t.flee.fail : undefined; }
      if(!target){ unknown.add(`${head} ｜ ${block} ｜ ${label}`); continue; }
      for(const s of splitCell(cell)) push(target, s, tags);
      continue;
    }
    // 写法 A：标签自带类别（〔X〕变体块里的片段带独占标签）
    const add = (target: any[]) => variant ? target.push({ tags: [variant], text: cell, only: true }) : push(target, cell, tags);
    const parts = bare.replace(/^逃跑(成功|失败)/, '逃跑 · $1').split(/\s*·\s*/);
    if(parts[0] === '余韵' && !parts[1]){ add(t.after.win); add(t.after.lose); continue; }
    if(parts[0] === '交涉'){ t.talk ??= { ok: [], fail: [] }; add(parts[1] === '成功' ? t.talk.ok : t.talk.fail); continue; }
    if(parts[0] === '落魄' || parts[0] === '防御'){ t.extra ??= {}; add(t.extra[parts.join('·')] ??= []); continue; }
    let target: any[] | undefined;
    if(parts[0] === '起') target = t.open;
    else if(parts[0] === '交锋'){ const a = APPROACH[parts[1]]; if(a) target = (t.clash[a] ??= []); }
    else if(TIER[parts[0]]) target = t.result[TIER[parts[0]]];
    else if(parts[0] === '余韵') target = /^(胜|成功)/.test(parts[1] ?? '') ? t.after.win : /^(败|失败)/.test(parts[1] ?? '') ? t.after.lose : undefined;
    else if(parts[0] === '逃跑') target = parts[1] === '成功' ? t.flee.ok : parts[1] === '失败' ? t.flee.fail : undefined;
    if(!target){ unknown.add(`${head} ｜ ${label}`); continue; }
    add(target);
  }
  if(!t.flee.ok.length && !t.flee.fail.length) delete t.flee;
  for(const k of ['enemy', 'locations', 'traits']) if(t[k] === undefined) delete t[k];
  const total = t.open.length + Object.values(t.result).flat().length + (t.flee ? t.flee.ok.length : 0);
  if(total) out[t.id] = t;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
const n = Object.values(out).reduce((a: number, t: any) => a + t.open.length + Object.values(t.clash).flat().length + Object.values(t.result).flat().length + t.after.win.length + t.after.lose.length + (t.flee ? t.flee.ok.length + t.flee.fail.length : 0), 0);
console.log(`${Object.keys(out).length} 场斗法，${n} 条片段 → content/combat/imported.json`);
if(unknown.size) console.log('未识别的行（需要补规则）：\n  ' + [...unknown].join('\n  '));
