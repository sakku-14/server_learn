import { createRoute, z } from '@hono/zod-openapi';
import { authController } from '../controllers/authController.js';
import { loginSchema, refreshSchema, registerSchema } from '../services/authService.js';
import { apiVersion } from '../middlewares/apiVersion.js';
import { auth } from '../middlewares/auth.js';
import { authRateLimit } from '../middlewares/rateLimit.js';
import { apiVersionHeader, BEARER_AUTH, createOpenAPIApp, errorResponse } from '../lib/openapi.js';

export const authRoutes = createOpenAPIApp();

authRoutes.use('*', apiVersion);

const LoginRequest = loginSchema.openapi('LoginRequest');
const RegisterRequest = registerSchema.openapi('RegisterRequest');
const RefreshRequest = refreshSchema.openapi('RefreshRequest');

const LoginResponse = z
  .object({
    token: z.string().openapi({ description: '認証用 JWT(アクセストークン、有効期限15分)' }),
    refreshToken: z
      .string()
      .openapi({ description: 'トークン再発行用のリフレッシュトークン(有効期限30日)' }),
    id: z.number().openapi({ example: 1 }),
    name: z.string().openapi({ example: '山田太郎' }),
    email: z.string().email().openapi({ example: 'user@example.com' }),
  })
  .openapi('LoginResponse');

const MessageResponse = z
  .object({ message: z.string().openapi({ example: 'ログアウトしました' }) })
  .openapi('MessageResponse');

const registerRoute = createRoute({
  method: 'post',
  path: '/register',
  tags: ['Auth'],
  summary: '新規登録',
  description: 'ユーザーを作成し、JWT を発行する（登録と同時に自動ログイン）。',
  middleware: [authRateLimit] as const,
  request: {
    headers: apiVersionHeader,
    body: { content: { 'application/json': { schema: RegisterRequest } } },
  },
  responses: {
    201: {
      description: '登録成功',
      content: { 'application/json': { schema: LoginResponse } },
    },
    400: errorResponse('バリデーションエラー'),
    409: errorResponse('メールアドレス重複'),
    429: errorResponse('レートリミット超過'),
  },
});

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['Auth'],
  summary: 'ログイン',
  description: 'メールアドレスとパスワードで認証し、JWT を発行する。',
  middleware: [authRateLimit] as const,
  request: {
    headers: apiVersionHeader,
    body: { content: { 'application/json': { schema: LoginRequest } } },
  },
  responses: {
    200: {
      description: 'ログイン成功',
      content: { 'application/json': { schema: LoginResponse } },
    },
    400: errorResponse('バリデーションエラー'),
    401: errorResponse('認証失敗'),
    429: errorResponse('レートリミット超過'),
  },
});

const refreshRoute = createRoute({
  method: 'post',
  path: '/refresh',
  tags: ['Auth'],
  summary: 'トークンリフレッシュ',
  description:
    'リフレッシュトークンと引き換えに新しいアクセストークンとリフレッシュトークンを発行する(使用済みトークンは無効化される)。',
  middleware: [authRateLimit] as const,
  request: {
    headers: apiVersionHeader,
    body: { content: { 'application/json': { schema: RefreshRequest } } },
  },
  responses: {
    200: {
      description: 'リフレッシュ成功',
      content: { 'application/json': { schema: LoginResponse } },
    },
    400: errorResponse('バリデーションエラー'),
    401: errorResponse('リフレッシュトークンが無効'),
    429: errorResponse('レートリミット超過'),
  },
});

const logoutRoute = createRoute({
  method: 'post',
  path: '/logout',
  tags: ['Auth'],
  summary: 'ログアウト',
  description: 'サーバー側のリフレッシュトークンを破棄する。',
  security: [{ [BEARER_AUTH]: [] }],
  middleware: [auth] as const,
  request: { headers: apiVersionHeader },
  responses: {
    200: {
      description: 'ログアウト成功',
      content: { 'application/json': { schema: MessageResponse } },
    },
    401: errorResponse('認証失敗'),
  },
});

authRoutes.openapi(registerRoute, (c) => authController.register(c));
authRoutes.openapi(loginRoute, (c) => authController.login(c));
authRoutes.openapi(refreshRoute, (c) => authController.refresh(c));
authRoutes.openapi(logoutRoute, (c) => authController.logout(c));
