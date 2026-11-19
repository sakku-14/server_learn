import { createHash, randomBytes } from 'node:crypto';

/** リフレッシュトークンの有効期間(日)。 */
const REFRESH_TOKEN_TTL_DAYS = 30;

/** クライアントに渡すリフレッシュトークン本体。推測不能な高エントロピーのランダム値。 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * DB 保存用のハッシュ。DB 流出時にトークン本体が漏れないようにする。
 * パスワードと違い十分にランダムな値なので、総当たりされる恐れがなく SHA-256 で足りる。
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** リフレッシュトークンの失効日時を返す。 */
export function refreshTokenExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
