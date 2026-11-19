import { execSync } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { sign } from 'hono/jwt';
// app の import 前に tests/setup.ts (vitest の setupFiles) が環境変数を設定している。
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';

/**
 * ルートレベルの統合テスト。
 * app.request() で HTTP レイヤーからサービス・リポジトリ・実 DB まで通しで検証する。
 * DB は docker-compose の Postgres 上の test スキーマを使う(事前に `docker compose up -d`)。
 */

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Api-Version': '1' };

const TEST_USER = {
  name: '統合テストユーザー',
  email: 'integration@example.com',
  password: 'password123',
};

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  // テスト用スキーマにマイグレーションを適用してから全行を削除する。
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' });
  await prisma.$executeRawUnsafe('TRUNCATE users RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('認証フロー(統合)', () => {
  let token: string;
  let refreshToken: string;

  it('POST /auth/register: ユーザーを作成しトークンを返す', async () => {
    const res = await post('/auth/register', TEST_USER);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTypeOf('string');
    expect(body.refreshToken).toBeTypeOf('string');
    expect(body.email).toBe(TEST_USER.email);

    // パスワードは平文で保存されていない
    const row = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    expect(row?.password).toMatch(/^\$argon2/);
  });

  it('POST /auth/register: メール重複は 409', async () => {
    const res = await post('/auth/register', TEST_USER);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('CONFLICT');
  });

  it('POST /auth/register: バリデーションエラーは 400', async () => {
    const res = await post('/auth/register', { name: '', email: 'invalid', password: 'short' });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  it('Api-Version ヘッダーがなければ 400', async () => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /auth/login: 正しい資格情報で 200', async () => {
    const res = await post('/auth/login', {
      email: TEST_USER.email,
      password: TEST_USER.password,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    token = body.token;
    refreshToken = body.refreshToken;
    expect(token).toBeTypeOf('string');
    expect(refreshToken).toBeTypeOf('string');
  });

  it('POST /auth/login: 誤ったパスワードは 401', async () => {
    const res = await post('/auth/login', { email: TEST_USER.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('UNAUTHORIZED');
  });

  it('GET /users/me: アクセストークンでプロフィールを取得できる', async () => {
    const res = await app.request('/users/me', {
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 1,
      name: TEST_USER.name,
      email: TEST_USER.email,
    });
  });

  it('GET /users/me: トークンなしは 401', async () => {
    const res = await app.request('/users/me', { headers: JSON_HEADERS });

    expect(res.status).toBe(401);
  });

  it('GET /users/me: 期限切れトークンは 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await sign(
      { userId: 1, iat: now - 3600, exp: now - 60 },
      process.env.JWT_SECRET!,
      'HS256',
    );

    const res = await app.request('/users/me', {
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${expired}` },
    });

    expect(res.status).toBe(401);
  });

  it('POST /auth/refresh: 新しいトークンを発行し古いリフレッシュトークンを無効化する', async () => {
    const res = await post('/auth/refresh', { refreshToken });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTypeOf('string');
    expect(body.refreshToken).not.toBe(refreshToken);

    // ローテーション: 使用済みトークンでは再発行できない
    const reuse = await post('/auth/refresh', { refreshToken });
    expect(reuse.status).toBe(401);

    token = body.token;
    refreshToken = body.refreshToken;
  });

  it('POST /auth/logout: リフレッシュトークンを破棄する', async () => {
    const res = await post('/auth/logout', {}, { Authorization: `Bearer ${token}` });

    expect(res.status).toBe(200);

    // ログアウト後はリフレッシュ不可
    const refresh = await post('/auth/refresh', { refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('ヘルスチェック(統合)', () => {
  it('GET /health: 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health/ready: DB 疎通ありで 200', async () => {
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
  });
});
