import { BITMAP_TYPES, saveImageUpload } from '../../../server/media';

export const prerender = false;

export async function POST({ request }: { request: Request }) {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return json({ ok: false, error: '没有收到文件。' }, 400);
  }

  const result = await saveImageUpload(file, {
    prefix: 'img',
    allowed: BITMAP_TYPES,
    maxBytes: 5 * 1024 * 1024,
  });

  return json(result, result.ok ? 200 : 400);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
