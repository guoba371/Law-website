import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { firm as firmSeed, articles as articleSeed, type ArticleBlock } from '../content/firm';

const DB_PATH = resolve(process.cwd(), 'data', 'app.db');

let connection: DatabaseSync | null = null;

/**
 * 站点设置项。键与默认值在首次建库时从 src/content/firm.ts 写入，
 * 之后以数据库为准。设置按站点隔离，主站默认 site_id = 1。
 */
export const SETTING_KEYS = [
  'name',
  'shortName',
  'logo',
  'license',
  'filing',
  'founded',
  'city',
  'address',
  'phone',
  'phoneDisplay',
  'email',
  'hours',
  'lawyerCount',
  'partnerCount',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Record<SettingKey, string>;

export const INQUIRY_STATUSES = ['new', 'contacted', 'engaged', 'invalid'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

function blocksToMarkdown(blocks: ArticleBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'h2') return `## ${block.text}`;
      if (block.type === 'quote') return `> ${block.text}`;
      if (block.type === 'list') return block.items.map((item) => `- ${item}`).join('\n');
      return block.text;
    })
    .join('\n\n');
}

function insertSeedSettings(db: DatabaseSync) {
  const insert = db.prepare('INSERT INTO settings (site_id, key, value) VALUES (1, ?, ?)');
  for (const key of SETTING_KEYS) {
    const value = key === 'logo' ? '' : String(firmSeed[key as keyof typeof firmSeed] ?? '');
    insert.run(key, value);
  }
}

function insertSeedSite(db: DatabaseSync) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM sites').get() as { n: number };
  if (existing.n > 0) return;

  // 站点名优先用已经存在的设置值，避免覆盖用户在后台改过的律所名称
  const row = db.prepare("SELECT value FROM settings WHERE site_id = 1 AND key = 'name'").get() as
    | { value: string }
    | undefined;
  const name = row?.value || firmSeed.name;

  db.prepare('INSERT INTO sites (slug, name, domain, created_at) VALUES (?, ?, ?, ?)').run(
    'main',
    name,
    '',
    new Date().toISOString(),
  );
}

function insertSeedArticles(db: DatabaseSync) {
  const insert = db.prepare(
    `INSERT INTO articles
      (site_id, slug, title, summary, category, author, published_at, updated_at, reading_time, keyword, status, body, created_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
  );
  for (const article of articleSeed) {
    insert.run(
      article.slug,
      article.title,
      article.description,
      article.category,
      article.author,
      article.date,
      article.updated,
      article.readingTime,
      article.keyword,
      blocksToMarkdown(article.body),
      new Date().toISOString(),
    );
  }
}

/**
 * 早期版本的 settings 是「key 一个主键」的全局表，没有站点维度。
 * 现在改成 (site_id, key) 复合主键，老库在这里做一次性迁移。
 */
function migrateSettingsToSites(db: DatabaseSync) {
  const columns = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[];
  if (columns.some((column) => column.name === 'site_id')) return;

  db.exec(`
    ALTER TABLE settings RENAME TO settings_legacy;

    CREATE TABLE settings (
      site_id INTEGER NOT NULL DEFAULT 1,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (site_id, key)
    );

    INSERT INTO settings (site_id, key, value)
      SELECT 1, key, value FROM settings_legacy;

    DROP TABLE settings_legacy;
  `);
}

function migrateArticlesToSites(db: DatabaseSync) {
  const columns = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[];
  if (columns.some((column) => column.name === 'site_id')) return;
  db.exec('ALTER TABLE articles ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1');
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slug       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      domain     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      site_id INTEGER NOT NULL DEFAULT 1,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (site_id, key)
    );

    CREATE TABLE IF NOT EXISTS articles (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id      INTEGER NOT NULL DEFAULT 1,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      summary      TEXT NOT NULL DEFAULT '',
      category     TEXT NOT NULL DEFAULT '',
      author       TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL DEFAULT '',
      reading_time INTEGER NOT NULL DEFAULT 5,
      keyword      TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'draft',
      body         TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id    INTEGER NOT NULL DEFAULT 1,
      name       TEXT NOT NULL,
      phone      TEXT NOT NULL,
      email      TEXT NOT NULL DEFAULT '',
      case_type  TEXT NOT NULL DEFAULT '',
      message    TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'new',
      consent    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_articles_status ON articles (status);
  `);

  migrateSettingsToSites(db);
  migrateArticlesToSites(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_articles_site ON articles (site_id, status);
    CREATE INDEX IF NOT EXISTS idx_inquiries_site_status ON inquiries (site_id, status);
  `);

  const settingsCount = db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number };
  if (settingsCount.n === 0) insertSeedSettings(db);

  insertSeedSite(db);

  const articleCount = db.prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number };
  if (articleCount.n === 0) insertSeedArticles(db);
}

export function getDb(): DatabaseSync {
  if (connection) return connection;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  connection = new DatabaseSync(DB_PATH);
  connection.exec('PRAGMA journal_mode = WAL');
  migrate(connection);
  return connection;
}

export const databaseFile = DB_PATH;
