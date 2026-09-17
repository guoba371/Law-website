import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { getDb } from './db';

/*
 * 上传文件的唯一存放位置是 data/uploads。
 * data/ 目录同时装着数据库和图片，也就是说站点的全部状态就是这一个目录，
 * 迁移时复制它即可，不用动代码。
 *
 * 不放 public/ 下的原因：public/ 只是构建期的输入，
 * 运行时上传的文件不会出现在 dist/client 里，生产模式下前台会 404。
 * 运行时由 /uploads/[file] 路由直接从 data/uploads 读取。
 */
export const UPLOAD_DIR = resolve(process.cwd(), 'data', 'uploads');

/** 构建产物里的静态目录。构建时同步一份过去，供纯静态部署（OSS/CDN）使用。 */
export const CLIENT_UPLOAD_DIR = resolve(process.cwd(), 'dist', 'client', 'uploads');
export const UPLOAD_URL_PREFIX = '/uploads/';

/**
 * 文章配图只允许位图格式。
 * SVG 能在同源下执行脚本，正文图片上传次数多，不收。
 * 站点 Logo 仍允许 SVG，那是单个品牌素材，风险面小得多。
 */
export const BITMAP_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export const LOGO_TYPES: Record<string, string> = {
  ...BITMAP_TYPES,
  'image/svg+xml': 'svg',
};

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

export async function saveImageUpload(
  file: File,
  options: { prefix: string; allowed: Record<string, string>; maxBytes: number },
): Promise<UploadResult> {
  const extension = options.allowed[file.type];
  if (!extension) {
    return { ok: false, error: `不支持的图片格式：${file.type || '未知'}` };
  }
  if (file.size > options.maxBytes) {
    return { ok: false, error: `图片不能超过 ${Math.round(options.maxBytes / 1024 / 1024)}MB。` };
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const suffix = Math.random().toString(36).slice(2, 8);
  const filename = `${options.prefix}-${Date.now()}-${suffix}.${extension}`;
  const contents = Buffer.from(await file.arrayBuffer());

  await writeFile(resolve(UPLOAD_DIR, filename), contents);

  /*
   * 生产模式下静态文件由 dist/client 提供，请求 /uploads/* 时静态处理器会先命中
   * 这个已存在的目录，SSR 路由拿不到请求。所以上传时顺带写一份进构建产物目录，
   * 新图片上传完立刻可访问，不必等重新构建。
   * 开发模式没有 dist/client，请求会落到 /uploads/[file] 路由，从 data/uploads 读取。
   */
  if (await isDirectory(CLIENT_UPLOAD_DIR)) {
    await writeFile(resolve(CLIENT_UPLOAD_DIR, filename), contents).catch(() => {});
  }

  return { ok: true, url: `${UPLOAD_URL_PREFIX}${filename}` };
}

async function isDirectory(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  return Boolean(info?.isDirectory());
}

/** 从 /uploads/xxx 里取出文件名，只接受单层文件名，防止越目录读取或删除。 */
export function resolveUploadName(url: string): string | null {
  if (!url.startsWith(UPLOAD_URL_PREFIX)) return null;
  const name = url.slice(UPLOAD_URL_PREFIX.length);
  if (!name || name !== basename(name) || name.includes('..')) return null;
  return name;
}

/** 无条件删除文件。用于替换或移除 Logo —— 调用方已经确认它不再被需要。 */
export async function removeUploadFile(url: string) {
  const name = resolveUploadName(url);
  if (!name) return;

  await unlink(resolve(UPLOAD_DIR, name)).catch(() => {});
  // 构建产物里的副本一并删除，否则纯静态部署下被删的图片仍可访问
  await unlink(resolve(CLIENT_UPLOAD_DIR, name)).catch(() => {});
}

/**
 * 删除图片文件。
 *
 * 编辑器里的正文可能还没保存，所以除了已入库的引用，还要拿到编辑器里的当前正文一起判断，
 * 否则用户会陷入「移除引用 → 必须先保存才能删文件」的循环。
 */
export async function deleteUpload(
  url: string,
  context: { body: string; articleId: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = resolveUploadName(url);
  if (!name) return { ok: false, error: '只能删除 /uploads/ 目录下的文件。' };

  if (context.body.includes(url)) {
    return { ok: false, error: '正文里还在引用这张图片，请先在编辑器里移除引用。' };
  }

  const db = getDb();
  const rows = db
    .prepare('SELECT slug FROM articles WHERE body LIKE ? AND id != ?')
    .all(`%${url}%`, context.articleId) as { slug: string }[];
  const references = rows.map((row) => `文章 ${row.slug}`);

  const logo = db.prepare("SELECT value FROM settings WHERE key = 'logo'").get() as
    | { value: string }
    | undefined;
  if (logo?.value === url) references.push('站点 Logo');

  if (references.length > 0) {
    return { ok: false, error: `这张图片还被其他内容引用：${references.join('、')}。` };
  }

  try {
    await unlink(resolve(UPLOAD_DIR, name));
  } catch {
    return { ok: false, error: '文件不存在，可能已被删除。' };
  }

  await removeUploadFile(url);

  return { ok: true };
}
