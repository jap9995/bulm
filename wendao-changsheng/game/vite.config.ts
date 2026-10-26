// 网页界面的构建配置：源码在 web/，引擎和内容直接引用 src/、content/
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'web',
  base: './',                       // TapTap 小游戏包按相对路径加载
  plugins: [preact({ babel: { cwd: here } })],   // 从别的目录启动时，babel 插件也按本目录解析
  server: { port: 5180, fs: { allow: ['..'] } },
  build: { outDir: '../dist-web', emptyOutDir: true, target: 'es2020' },
});
