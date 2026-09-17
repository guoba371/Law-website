import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineMiddleware } from 'astro:middleware';

import { SESSION_COOKIE, isValidSession } from './server/auth';
import { resolveUploadName, UPLOAD_DIR } from './server/media';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  gif: 'image/gif',
  avif: 'image/avif',
};

/*
 * 上传目录的兜底服务。
 *
 * 生产模式下 dist/client/uploads 里的文件由静态处理器直接返回，走不到这里；
 * 开发模式没有 dist/client，请求会落到中间件，从 data/uploads 读取。
 * 两条路径都指向同一个目录，所以上传后立刻就能访问，不必等重新构建。
 */
async function serveUpload(pathname: string): Promise<Response | null> {
  const name = resolveUploadName(pathname);
  if (!name) return null;

  const path = resolve(UPLOAD_DIR, name);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return null;

  const extension = name.split('.').pop()?.toLowerCase() ?? '';

  return new Response(await readFile(path), {
    headers: {
      'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'content-length': String(info.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith('/uploads/')) {
    const uploaded = await serveUpload(pathname);
    if (uploaded) return uploaded;
  }

  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login')) {
    return withNoStore(await next(), pathname);
  }

  if (!isValidSession(context.cookies.get(SESSION_COOKIE)?.value)) {
    return context.redirect(`/admin/login/?next=${encodeURIComponent(pathname)}`);
  }

  return withNoStore(await next(), pathname);
});

/**
 * 后台页面一律不缓存。
 * 少了这个头，退出登录后按浏览器后退键还能看到后台内容，共用电脑时是实打实的信息泄露。
 */
function withNoStore(response: Response, pathname: string): Response {
  if (!pathname.startsWith('/admin')) return response;

  response.headers.set('cache-control', 'no-store, must-revalidate');
  response.headers.set('pragma', 'no-cache');
  return response;
}
