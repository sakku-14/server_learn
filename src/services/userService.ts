import { z } from 'zod';
import { userRepository } from '../repositories/userRepository.js';
import { notFound } from '../lib/errors.js';
import { validate } from '../lib/validation.js';
import type { AuthUser } from '../types.js';

export const NAME_MAX_LENGTH = 50;

/** プロフィール更新の入力。name は前後の空白を除去してから長さを検証する。 */
export const updateProfileSchema = z.object({
  name: z
    .string({ required_error: '名前を入力してください' })
    .trim()
    .min(1, '名前を入力してください')
    .max(NAME_MAX_LENGTH, `${NAME_MAX_LENGTH}文字以内で入力してください`),
});

export const userService = {
  /** プロフィールを取得する。 */
  async getProfile(userId: number): Promise<AuthUser> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw notFound('ユーザーが見つかりません');
    }
    return { id: user.id, name: user.name, email: user.email };
  },

  /** プロフィール(名前)を更新し、更新後のプロフィールを返す。 */
  async updateProfile(userId: number, input: unknown): Promise<AuthUser> {
    const { name } = validate(updateProfileSchema, input);

    const user = await userRepository.findById(userId);
    if (!user) {
      throw notFound('ユーザーが見つかりません');
    }
    const updated = await userRepository.updateName(userId, name);
    return { id: updated.id, name: updated.name, email: updated.email };
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
