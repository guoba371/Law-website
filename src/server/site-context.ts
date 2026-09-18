/**
 * 前台渲染的是哪一个站点。
 *
 * 公开页面全部是构建期预渲染，所以这里读取的是构建时的环境变量。
 * 默认渲染主站（id=1）。以后站群渲染上线时，每个站点各自构建一次，
 * 构建时传入自己的 SITE_ID。
 */
export function currentSiteId(): number {
  const env = import.meta.env as Record<string, string | undefined>;
  const raw = env.SITE_ID ?? process.env.SITE_ID ?? '1';
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}
