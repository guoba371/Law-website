export const prerender = true;

/**
 * 站点地图地址跟着 SITE_URL 走，避免部署到真实域名后还指向 example.com。
 */
export function GET({ site }: { site: URL | undefined }) {
  const origin = (site ?? new URL('https://example.com')).origin;

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    'Disallow: /admin/',
    '',
    `Sitemap: ${origin}/sitemap-index.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
