import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import { loadEnv } from 'vite';

/*
 * 部署到公网时设置 SITE_URL，canonical、Open Graph、站点地图、robots.txt 都会跟着变。
 * 改完这个变量必须重新构建。
 *
 *   SITE_URL=https://www.你的域名.com npm run build
 *
 * 也会从项目根目录的 .env 里读，两种方式都行。
 */
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const site = process.env.SITE_URL ?? env.SITE_URL ?? 'https://example.com';

export default defineConfig({
  site,
  trailingSlash: 'always',
  /*
   * 公开站点仍然全部静态预渲染，只有 /admin 下的路由按需渲染。
   * 生产部署时把 dist/ 的静态产物推到 OSS/CDN，后台单独跑一个 Node 进程。
   */
  adapter: node({ mode: 'standalone' }),
  integrations: [
    // 后台路由不进站点地图，避免把 /admin 提交给搜索引擎
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith('/admin'),
    }),
  ],
  build: {
    format: 'directory',
  },
  vite: {
    ssr: {
      external: ['node:sqlite'],
    },
  },
});
