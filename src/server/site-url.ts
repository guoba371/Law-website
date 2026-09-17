const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * 前台地址。
 *
 * 后台如果部署在独立子域名（admin.xxx.com），站内的 `/` 指向的是后台自己，
 * 所以「查看站点」「前台预览」这类链接必须带上前台的绝对地址。
 *
 * 三种情况返回相对路径：
 *   - 开发模式
 *   - 后台和前台在同一个 host 上（同域名 /admin/ 的部署方式）
 *   - 本地起生产模式测试
 */
export function publicUrl(path = '/', currentHost = ''): string {
  if (import.meta.env.DEV) return path;

  const site = import.meta.env.SITE;
  if (!site) return path;

  if (currentHost === new URL(site).host || LOCAL_HOST.test(currentHost)) return path;

  return new URL(path, site).href;
}
