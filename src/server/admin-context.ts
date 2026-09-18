import { listSites } from './store';

/**
 * 后台当前选中的站点。
 * 站点通过 URL 查询参数 site=N 传递，默认取第一个站点（主站）。
 */
export function requestedSiteId(searchParams: URLSearchParams): number {
  const requested = Number(searchParams.get('site'));
  const sites = listSites();

  if (Number.isInteger(requested) && sites.some((site) => site.id === requested)) {
    return requested;
  }

  return sites[0]?.id ?? 1;
}
