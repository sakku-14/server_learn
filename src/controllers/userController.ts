import type { Context } from 'hono';
import { userService } from '../services/userService.js';
import type { AppEnv } from '../types.js';

export const userController = {
  /** GET /users/me */
  async getMe(c: Context<AppEnv>) {
    const user = c.get('user');
    const profile = await userService.getProfile(user.id);
    return c.json(profile, 200);
  },

  /** PATCH /users/me */
  async updateMe(c: Context<AppEnv>) {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const profile = await userService.updateProfile(user.id, body);

    c.get('logger').info({ userId: user.id }, 'プロフィール更新完了');
    return c.json(profile, 200);
  },

  /** DELETE /users/me */
  async deleteMe(c: Context<AppEnv>) {
    const user = c.get('user');
    await userService.deleteAccount(user.id);

    c.get('logger').info({ userId: user.id }, '退会処理完了');
    return c.body(null, 204);
  },
};
