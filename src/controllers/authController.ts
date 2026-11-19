import type { Context } from 'hono';
import { authService } from '../services/authService.js';
import type { AppEnv } from '../types.js';

export const authController = {
  /** POST /auth/register */
  async register(c: Context<AppEnv>) {
    const body = await c.req.json().catch(() => ({}));
    const result = await authService.register(body);

    c.get('logger').info({ userId: result.user.id }, '新規登録成功');
    return c.json({ token: result.token, refreshToken: result.refreshToken, ...result.user }, 201);
  },

  /** POST /auth/login */
  async login(c: Context<AppEnv>) {
    const body = await c.req.json().catch(() => ({}));
    const result = await authService.login(body);

    c.get('logger').info({ userId: result.user.id }, 'ログイン成功');
    return c.json({ token: result.token, refreshToken: result.refreshToken, ...result.user }, 200);
  },

  /** POST /auth/refresh */
  async refresh(c: Context<AppEnv>) {
    const body = await c.req.json().catch(() => ({}));
    const result = await authService.refresh(body);

    c.get('logger').info({ userId: result.user.id }, 'トークンリフレッシュ成功');
    return c.json({ token: result.token, refreshToken: result.refreshToken, ...result.user }, 200);
  },

  /** POST /auth/logout */
  async logout(c: Context<AppEnv>) {
    const user = c.get('user');
    await authService.logout(user.id);

    c.get('logger').info({ userId: user.id }, 'ログアウト成功');
    return c.json({ message: 'ログアウトしました' }, 200);
  },
};
