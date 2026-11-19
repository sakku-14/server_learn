import { rateLimiter } from 'hono-rate-limiter';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import { tooManyRequests } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

/**
 * クライアントの IP を特定する。
 * リバースプロキシ/LB 経由を想定して X-Forwarded-For を優先する
 * (直接公開する構成では偽装可能なため、本番では必ずプロキシ配下に置くこと)。
 */
function clientIp(c: Context<AppEnv>): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * IP 単位のレートリミッターを生成する(ウィンドウ: 1分)。
 * ストアはインメモリのため単一インスタンス前提。スケールアウトする場合は
 * Redis 等の共有ストアに差し替えること。
 */
function createRateLimiter(limit: number): MiddlewareHandler<AppEnv> {
  // テストでは無効化する(app.request() には接続情報がなく、テスト間で回数を共有してしまうため)
  if (env.NODE_ENV === 'test') {
    return (_c, next) => next();
  }

  return rateLimiter<AppEnv>({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-7',
    keyGenerator: clientIp,
    handler: () => {
      throw tooManyRequests();
    },
  });
}

/** API 全体に適用する緩めの制限。 */
export const globalRateLimit = createRateLimiter(100);

/** 認証系エンドポイント用の厳しめの制限(パスワード総当たり対策)。 */
export const authRateLimit = createRateLimiter(10);
