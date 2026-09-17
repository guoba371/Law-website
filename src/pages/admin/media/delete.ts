import { deleteUpload } from '../../../server/media';

export const prerender = false;

export async function POST({ request }: { request: Request }) {
  const form = await request.formData();
  const url = String(form.get('url') ?? '');
  const body = String(form.get('body') ?? '');
  const articleId = Number(form.get('articleId') ?? 0);

  if (!url) {
    return json({ ok: false, error: '缺少文件地址。' }, 400);
  }

  const result = await deleteUpload(url, {
    body,
    articleId: Number.isInteger(articleId) ? articleId : 0,
  });
  return json(result, result.ok ? 200 : 400);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
