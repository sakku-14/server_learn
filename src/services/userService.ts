import { userRepository } from '../repositories/userRepository.js';
import { notFound } from '../lib/errors.js';
import type { AuthUser } from '../types.js';

export const userService = {
  /** プロフィールを取得する。 */
  async getProfile(userId: number): Promise<AuthUser> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw notFound('ユーザーが見つかりません');
    }
    return { id: user.id, name: user.name, email: user.email };
  },

  /** 退会処理。ユーザーを削除する。 */
  async deleteAccount(userId: number): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw notFound('ユーザーが見つかりません');
    }
    await userRepository.deleteById(userId);
  },
};
