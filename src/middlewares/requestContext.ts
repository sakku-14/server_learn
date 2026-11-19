import { createMiddleware } from 'hono/factory';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../types.js';

/**
 * リクエストごとに以下を行う:
 * - ユニークな requestId(UUID) を付与する
 * - requestId 付きの子ロガーを Context に格納する
 * - レスポンスヘッダーに X-Request-Id を返す
 * - リクエスト完了時にメソッド・パス・ステータス・レスポンスタイムを記録する
 */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({ requestId });

  c.set('requestId', requestId);
  c.set('logger', reqLogger);
  c.header('X-Request-Id', requestId);

  const start = Date.now();
  reqLogger.info({ method: c.req.method, path: c.req.path }, 'request received');

  await next();

  const responseTimeMs = Date.now() - start;
  reqLogger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      responseTimeMs,
    },
    'request completed',
  );
});
