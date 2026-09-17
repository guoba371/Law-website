import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { firm as firmSeed, articles as articleSeed, type ArticleBlock } from '../content/firm';

const DB_PATH = resolve(process.cwd(), 'data', 'app.db');

let connection: DatabaseSync | null = null;

/**
 * 站点设置项。键与默认值在首次建库时从 src/content/firm.ts 写入，
 * 之后以数据库为准，公开站点和后台都从这里读。
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
  const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  for (const key of SETTING_KEYS) {
    const value = key === 'logo' ? '' : String(firmSeed[key as keyof typeof firmSeed] ?? '');
    insert.run(key, value);
  }
}

function insertSeedArticles(db: DatabaseSync) {
  const insert = db.prepare(
    `INSERT INTO articles
      (slug, title, summary, category, author, published_at, updated_at, reading_time, keyword, status, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
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

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS articles (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
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

    CREATE INDEX IF NOT EXISTS idx_articles_status ON articles (status);
  `);

  const settingsCount = db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number };
  if (settingsCount.n === 0) insertSeedSettings(db);

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
