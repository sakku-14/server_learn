import { createMiddleware } from 'hono/factory';
import { verifyToken } from '../lib/jwt.js';
import { unauthorized } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

/**
 * JWT 認証ミドルウェア。
 * - Authorization: Bearer <token> からトークンを取り出す
 * - 署名と有効期限(exp)を検証する。DB は参照しない(短命トークンのため失効管理は
 *   リフレッシュトークン側で行う。古い端末のアクセストークンも最長15分で失効する)
 * - 認証済みユーザーの ID を Context に格納する
 */
export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw unauthorized('認証トークンがありません');
  }

  const token = authHeader.slice('Bearer '.length).trim();

  let userId: number;
  try {
    ({ userId } = await verifyToken(token));
  } catch {
    c.get('logger').warn('JWT の検証に失敗しました');
    throw unauthorized('トークンが無効です');
  }

  c.set('user', { id: userId });
  await next();
});
