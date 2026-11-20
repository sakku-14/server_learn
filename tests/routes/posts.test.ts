import { execSync } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { sign } from 'hono/jwt';
// app の import 前に tests/setup.ts (vitest の setupFiles) が環境変数を設定している。
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { issueToken } from '../../src/lib/jwt.js';

/**
 * GET /posts/{id} の統合テスト。
 * DB は docker-compose の Postgres 上の test スキーマを使う(事前に `docker compose up -d`)。
 */

let token: string;
let postId: number;

function getPost(id: string | number, headers: Record<string, string> = {}) {
  return app.request(`/posts/${id}`, {
    method: 'GET',
    headers: { 'Api-Version': '1', ...headers },
  });
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' });
  await prisma.$executeRawUnsafe('TRUNCATE users, posts RESTART IDENTITY CASCADE');

  const user = await prisma.user.create({
    data: { name: '投稿テストユーザー', email: 'posts@example.com', password: 'x' },
  });
  const post = await prisma.post.create({
    data: {
      title: 'His mother had always taught him',
      body: 'His mother had always taught him not to ever think of himself as better than others...',
      tags: ['history', 'american', 'crime'],
      likes: 192,
      dislikes: 25,
      views: 305,
      userId: user.id,
    },
  });
  postId = post.id;
  token = await issueToken(user.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /posts/{id}(統合)', () => {
  it('200: 投稿詳細を camelCase・reactions ネストで返す', async () => {
    const res = await getPost(postId, { Authorization: `Bearer ${token}` });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: postId,
      title: 'His mother had always taught him',
      body: 'His mother had always taught him not to ever think of himself as better than others...',
      tags: ['history', 'american', 'crime'],
      reactions: { likes: 192, dislikes: 25 },
      views: 305,
      userId: expect.any(Number),
    });
  });

  it('404: 存在しない投稿は NOT_FOUND', async () => {
    const res = await getPost(999999, { Authorization: `Bearer ${token}` });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.detail.message).toBeTypeOf('string');
  });

  it('401: トークンなしは UNAUTHORIZED', async () => {
    const res = await getPost(postId);

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('UNAUTHORIZED');
  });

  it('401: 期限切れトークンは UNAUTHORIZED', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await sign(
      { userId: 1, iat: now - 3600, exp: now - 60 },
      process.env.JWT_SECRET!,
      'HS256',
    );
    const res = await getPost(postId, { Authorization: `Bearer ${expired}` });

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('UNAUTHORIZED');
  });

  it.each(['abc', '1.5', '0', '99999999999'])('400: id=%s は VALIDATION_ERROR', async (id) => {
    const res = await getPost(id, { Authorization: `Bearer ${token}` });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.detail.id).toBeTypeOf('string');
  });

  it('退会するとそのユーザーの投稿も削除される', async () => {
    const res = await app.request('/users/me', {
      method: 'DELETE',
      headers: { 'Api-Version': '1', Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);

    const after = await getPost(postId, { Authorization: `Bearer ${token}` });
    expect(after.status).toBe(404);
  });
});
