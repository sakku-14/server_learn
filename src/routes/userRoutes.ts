import { createRoute, z } from '@hono/zod-openapi';
import { userController } from '../controllers/userController.js';
import { updateProfileSchema } from '../services/userService.js';
import { apiVersion } from '../middlewares/apiVersion.js';
import { auth } from '../middlewares/auth.js';
import { apiVersionHeader, BEARER_AUTH, createOpenAPIApp, errorResponse } from '../lib/openapi.js';

export const userRoutes = createOpenAPIApp();

userRoutes.use('*', apiVersion);
userRoutes.use('*', auth);

const UserResponse = z
  .object({
    id: z.number().openapi({ example: 1 }),
    name: z.string().openapi({ example: '山田太郎' }),
    email: z.string().email().openapi({ example: 'user@example.com' }),
  })
  .openapi('User');

const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['User'],
  summary: 'プロフィール取得',
  description: '認証中ユーザーのプロフィールを返す。',
  security: [{ [BEARER_AUTH]: [] }],
  request: { headers: apiVersionHeader },
  responses: {
    200: {
      description: 'プロフィール',
      content: { 'application/json': { schema: UserResponse } },
    },
    401: errorResponse('認証失敗'),
    404: errorResponse('ユーザーが見つからない'),
  },
});

const UpdateProfileRequest = updateProfileSchema.openapi('UpdateProfileRequest');

const updateMeRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['User'],
  summary: 'プロフィール更新',
  description:
    '認証中ユーザーの名前を更新し、更新後のプロフィールを返す。name は前後の空白を除去したうえで 1〜50 文字。',
  security: [{ [BEARER_AUTH]: [] }],
  request: {
    headers: apiVersionHeader,
    body: { content: { 'application/json': { schema: UpdateProfileRequest } } },
  },
  responses: {
    200: {
      description: '更新後のプロフィール',
      content: { 'application/json': { schema: UserResponse } },
    },
    400: errorResponse('バリデーションエラー'),
    401: errorResponse('認証失敗'),
    404: errorResponse('ユーザーが見つからない'),
  },
});

const deleteMeRoute = createRoute({
  method: 'delete',
  path: '/me',
  tags: ['User'],
  summary: '退会',
  description: '認証中ユーザーを削除する。',
  security: [{ [BEARER_AUTH]: [] }],
  request: { headers: apiVersionHeader },
  responses: {
    204: { description: '退会完了（本文なし）' },
    401: errorResponse('認証失敗'),
    404: errorResponse('ユーザーが見つからない'),
  },
});

userRoutes.openapi(getMeRoute, (c) => userController.getMe(c));
userRoutes.openapi(updateMeRoute, (c) => userController.updateMe(c));
userRoutes.openapi(deleteMeRoute, (c) => userController.deleteMe(c));
