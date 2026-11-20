import { createRoute, z } from '@hono/zod-openapi';
import { postController } from '../controllers/postController.js';
import { apiVersion } from '../middlewares/apiVersion.js';
import { auth } from '../middlewares/auth.js';
import { apiVersionHeader, BEARER_AUTH, createOpenAPIApp, errorResponse } from '../lib/openapi.js';

export const postRoutes = createOpenAPIApp();

postRoutes.use('*', apiVersion);
postRoutes.use('*', auth);

const PostIdParam = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'id は整数で指定してください' })
    .int('id は整数で指定してください')
    .positive('id は 1 以上で指定してください')
    // posts.id は INTEGER のため、範囲外の値は DB に投げる前に弾く(Prisma のエラー → 500 を防ぐ)
    .max(2_147_483_647, 'id が大きすぎます')
    .openapi({ param: { name: 'id', in: 'path' }, example: 1 }),
});

const PostResponse = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    title: z.string().openapi({ example: 'His mother had always taught him' }),
    body: z.string().openapi({
      example:
        'His mother had always taught him not to ever think of himself as better than others...',
    }),
    tags: z.array(z.string()).openapi({ example: ['history', 'american', 'crime'] }),
    reactions: z.object({
      likes: z.number().int().openapi({ example: 192 }),
      dislikes: z.number().int().openapi({ example: 25 }),
    }),
    views: z.number().int().openapi({ example: 305 }),
    userId: z.number().int().openapi({ example: 1, description: '投稿者のユーザー ID' }),
  })
  .openapi('Post');

const getPostRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Post'],
  summary: '投稿詳細取得',
  description: '指定 ID の投稿を返す。',
  security: [{ [BEARER_AUTH]: [] }],
  request: { headers: apiVersionHeader, params: PostIdParam },
  responses: {
    200: {
      description: '投稿詳細',
      content: { 'application/json': { schema: PostResponse } },
    },
    400: errorResponse('id が整数でない'),
    401: errorResponse('認証失敗'),
    404: errorResponse('投稿が見つからない'),
  },
});

postRoutes.openapi(getPostRoute, (c) => postController.getPost(c, c.req.valid('param').id));
