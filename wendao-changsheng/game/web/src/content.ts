// 浏览器里组装内容配置：打包时把 content/ 下的 JSON 直接引进来（Node 里由 scripts/load.ts 读文件，两边都调用 buildContent）
import { buildContent } from '../../src/engine/content.ts';
import type { Content } from '../../src/engine/types.ts';
import realms from '../../content/realms.json';
import origins from '../../content/origins.json';
import talents from '../../content/talents.json';
import items from '../../content/items.json';
import techniques from '../../content/techniques.json';
import world from '../../content/world.json';
import sects from '../../content/sects.json';
import abode from '../../content/abode.json';
import npcs from '../../content/npcs.json';
import destinies from '../../content/destinies.json';

const sorted = (m: Record<string, unknown>) => Object.keys(m).sort().map(k => m[k]);
const events = import.meta.glob('../../content/events/*.json', { eager: true, import: 'default' });
const combat = import.meta.glob('../../content/combat/*.json', { eager: true, import: 'default' });

export const content: Content = buildContent({
  realms, origins, talents, items, techniques, world, sects, abode, npcs, destinies,
  events: sorted(events), combat: sorted(combat),
} as any);
