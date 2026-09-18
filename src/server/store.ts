import {
  getDb,
  INQUIRY_STATUSES,
  SETTING_KEYS,
  type InquiryStatus,
  type Settings,
  type SettingKey,
} from './db';

export type SiteRecord = {
  id: number;
  slug: string;
  name: string;
  domain: string;
};

export type ArticleRecord = {
  id: number;
  siteId: number;
  slug: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  readingTime: number;
  keyword: string;
  status: 'draft' | 'published';
  body: string;
};

export type InquiryRecord = {
  id: number;
  siteId: number;
  name: string;
  phone: string;
  email: string;
  caseType: string;
  message: string;
  status: InquiryStatus;
  consent: boolean;
  createdAt: string;
};

type ArticleRow = {
  id: number;
  site_id: number;
  slug: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  published_at: string;
  updated_at: string;
  reading_time: number;
  keyword: string;
  status: string;
  body: string;
};

type InquiryRow = {
  id: number;
  site_id: number;
  name: string;
  phone: string;
  email: string;
  case_type: string;
  message: string;
  status: string;
  consent: number;
  created_at: string;
};

function toArticle(row: ArticleRow): ArticleRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    author: row.author,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    readingTime: row.reading_time,
    keyword: row.keyword,
    status: row.status === 'published' ? 'published' : 'draft',
    body: row.body,
  };
}

function toInquiry(row: InquiryRow): InquiryRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    caseType: row.case_type,
    message: row.message,
    status: INQUIRY_STATUSES.includes(row.status as InquiryStatus)
      ? (row.status as InquiryStatus)
      : 'new',
    consent: row.consent === 1,
    createdAt: row.created_at,
  };
}

/* ---------- 站点 ---------- */

export function listSites(): SiteRecord[] {
  return getDb().prepare('SELECT id, slug, name, domain FROM sites ORDER BY id').all() as SiteRecord[];
}

export function getSite(id: number): SiteRecord | undefined {
  return getDb().prepare('SELECT id, slug, name, domain FROM sites WHERE id = ?').get(id) as
    | SiteRecord
    | undefined;
}

/* ---------- 站点设置 ---------- */

export function getSettings(siteId = 1): Settings {
  const rows = getDb()
    .prepare('SELECT key, value FROM settings WHERE site_id = ?')
    .all(siteId) as { key: string; value: string }[];

  const settings = Object.fromEntries(SETTING_KEYS.map((key) => [key, ''])) as Settings;
  for (const row of rows) {
    if (SETTING_KEYS.includes(row.key as SettingKey)) settings[row.key as SettingKey] = row.value;
  }
  return settings;
}

export function saveSettings(values: Partial<Record<SettingKey, string>>, siteId = 1) {
  const statement = getDb().prepare(
    `INSERT INTO settings (site_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(site_id, key) DO UPDATE SET value = excluded.value`,
  );
  for (const [key, value] of Object.entries(values)) {
    if (SETTING_KEYS.includes(key as SettingKey)) statement.run(siteId, key, value ?? '');
  }
}

/* ---------- 文章 ---------- */

export function listArticles(options: { publishedOnly?: boolean; siteId?: number } = {}): ArticleRecord[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.publishedOnly) where.push("status = 'published'");
  if (options.siteId !== undefined) {
    where.push('site_id = ?');
    params.push(options.siteId);
  }

  const sql = `SELECT * FROM articles
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY published_at DESC, id DESC`;

  return (getDb().prepare(sql).all(...params) as ArticleRow[]).map(toArticle);
}

export function getArticle(id: number): ArticleRecord | undefined {
  const row = getDb().prepare('SELECT * FROM articles WHERE id = ?').get(id) as ArticleRow | undefined;
  return row ? toArticle(row) : undefined;
}

export function getArticleBySlug(slug: string, siteId = 1): ArticleRecord | undefined {
  const row = getDb()
    .prepare("SELECT * FROM articles WHERE slug = ? AND site_id = ? AND status = 'published'")
    .get(slug, siteId) as ArticleRow | undefined;
  return row ? toArticle(row) : undefined;
}

export type ArticleInput = Omit<ArticleRecord, 'id'>;

export function createArticle(input: ArticleInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO articles
        (site_id, slug, title, summary, category, author, published_at, updated_at, reading_time, keyword, status, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.siteId,
      input.slug,
      input.title,
      input.summary,
      input.category,
      input.author,
      input.publishedAt,
      input.updatedAt,
      input.readingTime,
      input.keyword,
      input.status,
      input.body,
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function updateArticle(id: number, input: ArticleInput) {
  getDb()
    .prepare(
      `UPDATE articles SET
        site_id = ?, slug = ?, title = ?, summary = ?, category = ?, author = ?,
        published_at = ?, updated_at = ?, reading_time = ?, keyword = ?, status = ?, body = ?
       WHERE id = ?`,
    )
    .run(
      input.siteId,
      input.slug,
      input.title,
      input.summary,
      input.category,
      input.author,
      input.publishedAt,
      input.updatedAt,
      input.readingTime,
      input.keyword,
      input.status,
      input.body,
      id,
    );
}

export function deleteArticle(id: number) {
  getDb().prepare('DELETE FROM articles WHERE id = ?').run(id);
}

export function countArticles(siteId?: number): { total: number; published: number; draft: number } {
  const where = siteId !== undefined ? 'WHERE site_id = ?' : '';
  const params = siteId !== undefined ? [siteId] : [];
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
       FROM articles ${where}`,
    )
    .get(...params) as { total: number; published: number | null };

  const published = row.published ?? 0;
  return { total: row.total, published, draft: row.total - published };
}

export function listCategories(siteId?: number): string[] {
  const where = siteId !== undefined ? 'AND site_id = ?' : '';
  const params = siteId !== undefined ? [siteId] : [];
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT category FROM articles
       WHERE category != '' ${where}
       ORDER BY category`,
    )
    .all(...params) as { category: string }[];
  return rows.map((row) => row.category);
}

export function slugExists(slug: string, siteId: number, exceptId?: number): boolean {
  const row = getDb()
    .prepare('SELECT id FROM articles WHERE slug = ? AND site_id = ? AND id != ?')
    .get(slug, siteId, exceptId ?? -1) as { id: number } | undefined;
  return Boolean(row);
}

/* ---------- 咨询线索 ---------- */

export type InquiryInput = Omit<InquiryRecord, 'id' | 'status' | 'createdAt'> & {
  status?: InquiryStatus;
};

export function createInquiry(input: InquiryInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO inquiries (site_id, name, phone, email, case_type, message, status, consent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.siteId,
      input.name,
      input.phone,
      input.email,
      input.caseType,
      input.message,
      input.status ?? 'new',
      input.consent ? 1 : 0,
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function listInquiries(options: { siteId?: number; status?: InquiryStatus } = {}): InquiryRecord[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.siteId !== undefined) {
    where.push('site_id = ?');
    params.push(options.siteId);
  }
  if (options.status) {
    where.push('status = ?');
    params.push(options.status);
  }

  const sql = `SELECT * FROM inquiries
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC`;

  return (getDb().prepare(sql).all(...params) as InquiryRow[]).map(toInquiry);
}

export function updateInquiryStatus(id: number, status: InquiryStatus) {
  if (!INQUIRY_STATUSES.includes(status)) return;
  getDb().prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, id);
}

export function countInquiries(siteId?: number): { total: number; new: number } {
  const where = siteId !== undefined ? 'WHERE site_id = ?' : '';
  const params = siteId !== undefined ? [siteId] : [];
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new
       FROM inquiries ${where}`,
    )
    .get(...params) as { total: number; new: number | null };
  return { total: row.total, new: row.new ?? 0 };
}
