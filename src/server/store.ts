import { getDb, SETTING_KEYS, type Settings, type SettingKey } from './db';

export type ArticleRecord = {
  id: number;
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

type ArticleRow = {
  id: number;
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

function toArticle(row: ArticleRow): ArticleRecord {
  return {
    id: row.id,
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

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const settings = Object.fromEntries(SETTING_KEYS.map((key) => [key, ''])) as Settings;
  for (const row of rows) {
    if (SETTING_KEYS.includes(row.key as SettingKey)) settings[row.key as SettingKey] = row.value;
  }
  return settings;
}

export function saveSettings(values: Partial<Record<SettingKey, string>>) {
  const statement = getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(values)) {
    if (SETTING_KEYS.includes(key as SettingKey)) statement.run(key, value ?? '');
  }
}

export function listArticles(options: { publishedOnly?: boolean } = {}): ArticleRecord[] {
  const sql = options.publishedOnly
    ? "SELECT * FROM articles WHERE status = 'published' ORDER BY published_at DESC, id DESC"
    : 'SELECT * FROM articles ORDER BY id DESC';
  return (getDb().prepare(sql).all() as ArticleRow[]).map(toArticle);
}

export function getArticle(id: number): ArticleRecord | undefined {
  const row = getDb().prepare('SELECT * FROM articles WHERE id = ?').get(id) as ArticleRow | undefined;
  return row ? toArticle(row) : undefined;
}

export function getArticleBySlug(slug: string): ArticleRecord | undefined {
  const row = getDb()
    .prepare("SELECT * FROM articles WHERE slug = ? AND status = 'published'")
    .get(slug) as ArticleRow | undefined;
  return row ? toArticle(row) : undefined;
}

export type ArticleInput = Omit<ArticleRecord, 'id'>;

export function createArticle(input: ArticleInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO articles
        (slug, title, summary, category, author, published_at, updated_at, reading_time, keyword, status, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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
        slug = ?, title = ?, summary = ?, category = ?, author = ?,
        published_at = ?, updated_at = ?, reading_time = ?, keyword = ?, status = ?, body = ?
       WHERE id = ?`,
    )
    .run(
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

export function countArticles(): { total: number; published: number; draft: number } {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
       FROM articles`,
    )
    .get() as { total: number; published: number | null };
  const published = row.published ?? 0;
  return { total: row.total, published, draft: row.total - published };
}

export function listCategories(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT category FROM articles WHERE category != '' ORDER BY category")
    .all() as { category: string }[];
  return rows.map((row) => row.category);
}

export function slugExists(slug: string, exceptId?: number): boolean {
  const row = getDb()
    .prepare('SELECT id FROM articles WHERE slug = ? AND id != ?')
    .get(slug, exceptId ?? -1) as { id: number } | undefined;
  return Boolean(row);
}
