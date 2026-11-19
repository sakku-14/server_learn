import { sign, verify } from 'hono/jwt';
import { env } from '../config/env.js';

/** アクセストークンの有効期間(秒)。短命にし、継続利用はリフレッシュトークンで行う。 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface JwtPayload {
  userId: number;
}

/**
 * 短命のアクセストークン(JWT)を発行する。
 * 検証は署名 + exp のみで DB を参照しないため、盗難時の影響は有効期限内に限定され、
 * リクエスト毎の DB アクセスも発生しない。
 * `jti` にランダム値を入れ、発行のたびに必ず異なるトークンが生成されるようにする。
 */
export async function issueToken(userId: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { userId, iat: now, exp: now + ACCESS_TOKEN_TTL_SECONDS, jti: crypto.randomUUID() },
    env.JWT_SECRET,
    'HS256',
  );
}

/** JWT の署名と有効期限を検証し、ペイロードを返す。不正・期限切れの場合は例外を投げる。 */
export async function verifyToken(token: string): Promise<JwtPayload> {
  const payload = await verify(token, env.JWT_SECRET, 'HS256');
  return { userId: Number(payload.userId) };
}
