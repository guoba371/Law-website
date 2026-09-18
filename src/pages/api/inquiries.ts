import { currentSiteId } from '../../server/site-context';
import { notifyNewInquiry } from '../../server/notify';
import { createInquiry, getSite } from '../../server/store';

export const prerender = false;

/*
 * 简单的内存限流：同一个 IP 十分钟内只能提交一次。
 * 单进程部署够用；将来如果横向扩容，要换成共享存储（例如 Redis）。
 */
const lastSubmitAt = new Map<string, number>();
const RATE_LIMIT_MS = 10 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

export async function POST({ request }: { request: Request }) {
  const form = await request.formData();

  // 蜜罐：正常用户看不到这个字段，机器人会填
  if (String(form.get('website') ?? '').trim() !== '') {
    return json({ ok: true });
  }

  const name = String(form.get('name') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const caseType = String(form.get('caseType') ?? '').trim();
  const message = String(form.get('message') ?? '').trim();
  const consent = form.get('consent') === 'on';

  if (!name || !phone || !message) {
    return json({ ok: false, error: '请填写姓名、电话和咨询内容。' }, 400);
  }
  if (!consent) {
    return json({ ok: false, error: '请先同意隐私政策。' }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ ok: false, error: '咨询内容过长，请控制在 2000 字以内。' }, 400);
  }

  const ip = clientIp(request);
  const now = Date.now();
  const previous = lastSubmitAt.get(ip);
  if (previous && now - previous < RATE_LIMIT_MS) {
    return json({ ok: false, error: '提交太频繁，请十分钟后再试。' }, 429);
  }
  lastSubmitAt.set(ip, now);

  const rawSite = Number(form.get('site'));
  const siteId = Number.isInteger(rawSite) && rawSite > 0 ? rawSite : currentSiteId();

  createInquiry({
    siteId,
    name,
    phone,
    email,
    caseType,
    message,
    consent: true,
  });

  const site = getSite(siteId);
  void notifyNewInquiry({
    name,
    phone,
    email,
    caseType,
    message,
    siteName: site?.name ?? '主站',
  });

  return json({ ok: true });
}

/*
 * 这个地址不是给人在浏览器里打开的，它只接受咨询表单发来的 POST。
 * 直接访问时给一个明确提示，而不是让人误以为接口坏了。
 */
export function GET() {
  return new Response(
    JSON.stringify({
      ok: false,
      error: '这是一个提交接口，请通过网站联系页的咨询表单使用，不支持直接在浏览器里访问。',
    }),
    {
      status: 405,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        allow: 'POST',
      },
    },
  );
}
