import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { env, isProduction } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { BEARER_AUTH } from './lib/openapi.js';
import { requestContext } from './middlewares/requestContext.js';
import { globalRateLimit } from './middlewares/rateLimit.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { authRoutes } from './routes/authRoutes.js';
import { userRoutes } from './routes/userRoutes.js';
import type { AppEnv } from './types.js';

export const app = new OpenAPIHono<AppEnv>();

// ブラウザ向けの基本的な防御ヘッダー(X-Frame-Options 等)を全レスポンスに付与する。
app.use('*', secureHeaders());

// CORS は許可リスト方式。CORS_ORIGINS(カンマ区切り)で指定し、開発環境では localhost も許可する。
// ネイティブアプリからのリクエストは CORS の対象外のため、これはブラウザ経路(/reference 等)向け。
const allowedOrigins = (env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (allowedOrigins.includes(origin)) return origin;
      if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return origin;
      }
      return null;
    },
  }),
);

app.use('*', requestContext);

// ヘルスチェック: 認証・バージョン・レートリミット不要
// liveness: プロセスの生死のみを返す
app.get('/health', (c) => c.json({ status: 'ok' }, 200));
// readiness: DB 疎通まで確認する(LB やオーケストレータが不健康なインスタンスを切り離すために使う)
app.get('/health/ready', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ok' }, 200);
  } catch {
    return c.json({ status: 'unavailable' }, 503);
  }
});

// ここから下のルートにはレートリミットを適用する(認証系はルート側でさらに厳しい制限を重ねる)。
app.use('*', globalRateLimit);

app.route('/auth', authRoutes);
app.route('/users', userRoutes);

// Bearer (JWT) 認証スキームを登録する。各 protected ルートの security で参照される。
app.openAPIRegistry.registerComponent('securitySchemes', BEARER_AUTH, {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// OpenAPI 仕様(JSON)と Scalar ドキュメント UI を公開する。
app.doc('/doc', {
  openapi: '3.1.0',
  info: { title: 'App Backend API', version: '1.0.0' },
});
app.get('/reference', Scalar({ url: '/doc' }));

// 共通エラーハンドラー(全例外を集約)
app.onError(errorHandler);

app.notFound((c) =>
  c.json({ code: 'NOT_FOUND', detail: { message: 'エンドポイントが見つかりません' } }, 404),
);
