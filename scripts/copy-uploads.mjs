import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * 把 data/uploads 同步到 dist/client/uploads。
 *
 * 运行时由 /uploads/[file] 路由直接从 data/uploads 读取，这一步是为了让
 * 「静态产物推 OSS/CDN」的部署方式也能拿到图片。同步时会清掉目标目录里
 * 源目录已不存在的文件，避免删掉的图片在 CDN 上残留。
 */

const source = join(process.cwd(), 'data', 'uploads');
const target = join(process.cwd(), 'dist', 'client', 'uploads');

const files = await readdir(source).catch(() => []);
await mkdir(target, { recursive: true });

for (const file of files) {
  await copyFile(join(source, file), join(target, file));
}

const existing = await readdir(target).catch(() => []);
let removed = 0;
for (const file of existing) {
  if (files.includes(file)) continue;
  await unlink(join(target, file)).catch(() => {});
  removed += 1;
}

console.log(`[uploads] 同步 ${files.length} 个文件到 dist/client/uploads，清理 ${removed} 个`);
