// Node 里读取 content/ 目录并组装内容配置（浏览器版由打包工具直接引入 JSON）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent } from '../src/engine/content.ts';
import type { Content } from '../src/engine/types.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const dir = (d: string) => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.json')).sort().map(f => read(path.join(d, f)));

export function loadContent(): Content {
  return buildContent({
    realms: read('realms.json'), origins: read('origins.json'), talents: read('talents.json'),
    items: read('items.json'), techniques: read('techniques.json'), world: read('world.json'), sects: read('sects.json'), abode: read('abode.json'), npcs: read('npcs.json'), destinies: read('destinies.json'),
    events: dir('events'), combat: dir('combat'),
  });
}
