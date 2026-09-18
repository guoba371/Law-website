import { slugExists, type ArticleInput } from './store';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ParseResult =
  | { ok: true; value: ArticleInput }
  | { ok: false; error: string; draft: ArticleInput };

export function emptyArticle(siteId = 1): ArticleInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    siteId,
    slug: '',
    title: '',
    summary: '',
    category: '',
    author: '',
    publishedAt: today,
    updatedAt: today,
    readingTime: 8,
    keyword: '',
    status: 'draft',
    body: '',
  };
}

export function parseArticleForm(form: FormData, exceptId?: number): ParseResult {
  const text = (key: string) => String(form.get(key) ?? '').trim();

  const readingTime = Number(text('readingTime'));
  const requestedSite = Number(text('site'));
  const siteId = Number.isInteger(requestedSite) && requestedSite > 0 ? requestedSite : 1;
  const draft: ArticleInput = {
    siteId,
    slug: text('slug'),
    title: text('title'),
    summary: text('summary'),
    category: text('category'),
    author: text('author'),
    publishedAt: text('publishedAt') || new Date().toISOString().slice(0, 10),
    updatedAt: text('updatedAt') || new Date().toISOString().slice(0, 10),
    readingTime: Number.isFinite(readingTime) ? Math.min(60, Math.max(1, Math.round(readingTime))) : 8,
    keyword: text('keyword'),
    status: text('status') === 'published' ? 'published' : 'draft',
    body: String(form.get('body') ?? ''),
  };

  if (!draft.title) return { ok: false, error: '标题不能为空。', draft };
  if (!SLUG_PATTERN.test(draft.slug)) {
    return { ok: false, error: '路径标识只能使用英文小写字母、数字和连字符，例如 labor-arbitration-limitation。', draft };
  }
  if (slugExists(draft.slug, siteId, exceptId)) {
    return { ok: false, error: `路径标识 ${draft.slug} 在该站点已被另一篇文章占用。`, draft };
  }

  return { ok: true, value: draft };
}
