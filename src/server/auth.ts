import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

import { getDb } from './db';

export const SESSION_COOKIE = 'admin_session';

/*
 * 会话 cookie 只在后台路径下发送。
 * 收窄到 /admin 之后，前台页面和图片请求都不会再带上它。
 * 注意：设置与删除必须用同一个 path，否则退出登录清不掉 cookie。
 */
export const SESSION_COOKIE_PATH = '/admin';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

/**
 * 生产环境通常挡在 Nginx 之类的反向代理后面，应用自己看到的是 http，
 * 只判断 Astro.url.protocol 会让 Secure 标记丢失。优先读代理传来的协议头。
 */
export function isSecureRequest(request: Request, url: URL): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return url.protocol === 'https:';
}

export const DEFAULT_PASSWORD = 'lawfirm2026';

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

export function isUsingDefaultPassword(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

/** 首次运行时生成并存库的签名密钥，重启后会话不失效。 */
function sessionSecret(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'session_secret'").get() as
    | { value: string }
    | undefined;
  if (row?.value) return row.value;

  const secret = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('session_secret', ?)").run(secret);
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('hex');
}

export function verifyPassword(candidate: string): boolean {
  const expected = Buffer.from(adminPassword());
  const actual = Buffer.from(candidate);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function createSessionToken(): string {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature) return false;
  if (Number(expiresAt) < Date.now()) return false;

  const expected = Buffer.from(sign(expiresAt));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export const sessionMaxAgeSeconds = SESSION_TTL_MS / 1000;
