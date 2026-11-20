import { execSync } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
// app の import 前に tests/setup.ts (vitest の setupFiles) が環境変数を設定している。
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { issueToken } from '../../src/lib/jwt.js';

/**
 * PATCH /users/me の統合テスト。
 * DB は docker-compose の Postgres 上の test スキーマを使う(事前に `docker compose up -d`)。
 */

let token: string;

function patchMe(body: unknown, headers: Record<string, string> = {}) {
  return app.request('/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Api-Version': '1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' });
  await prisma.$executeRawUnsafe('TRUNCATE users, posts RESTART IDENTITY CASCADE');

  const user = await prisma.user.create({
    data: { name: '更新前の名前', email: 'users@example.com', password: 'x' },
  });
  token = await issueToken(user.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PATCH /users/me(統合)', () => {
  it('200: 名前を更新し、更新後のプロフィールを返す(GET にも反映される)', async () => {
    const res = await patchMe({ name: '  更新後の名前  ' }, { Authorization: `Bearer ${token}` });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: expect.any(Number),
      name: '更新後の名前',
      email: 'users@example.com',
    });

    const me = await app.request('/users/me', {
      headers: { 'Api-Version': '1', Authorization: `Bearer ${token}` },
    });
    expect(((await me.json()) as { name: string }).name).toBe('更新後の名前');
  });

  it.each([
    ['空白のみ', { name: '   ' }],
    ['51 文字', { name: 'あ'.repeat(51) }],
    ['name なし', {}],
  ])('400: %s は VALIDATION_ERROR', async (_label, body) => {
    const res = await patchMe(body, { Authorization: `Bearer ${token}` });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; detail: Record<string, string> };
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.detail.name).toBeTypeOf('string');
  });

  it('401: トークンなしは UNAUTHORIZED', async () => {
    const res = await patchMe({ name: '名前' });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('404: 退会済みユーザーのトークンは NOT_FOUND', async () => {
    const del = await app.request('/users/me', {
      method: 'DELETE',
      headers: { 'Api-Version': '1', Authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(204);

    const res = await patchMe({ name: '名前' }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('NOT_FOUND');
  });
});
