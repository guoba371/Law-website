import { SESSION_COOKIE, SESSION_COOKIE_PATH } from '../../server/auth';

export const prerender = false;

/*
 * 清两遍路径：/admin 是当前使用的，/ 是早期版本写入的。
 * cookie 的删除按 name + path 匹配，只删一条会留下另一条，
 * 表现就是「退出登录后仍能进入后台」。
 *
 * 这里不用 Astro 的 cookies.delete，因为它按 cookie 名字去重，
 * 两次 delete 只会发出一条 Set-Cookie。
 */
const PATHS_TO_CLEAR = [SESSION_COOKIE_PATH, '/'];

export async function POST({ redirect }) {
  const response = redirect('/admin/login/');

  for (const path of PATHS_TO_CLEAR) {
    response.headers.append(
      'set-cookie',
      `${SESSION_COOKIE}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax`,
    );
  }

  return response;
}
