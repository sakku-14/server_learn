import { z } from 'zod';
import type { User } from '@prisma/client';
import { userRepository } from '../repositories/userRepository.js';
import { issueToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from '../lib/refreshToken.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { validate } from '../lib/validation.js';
import type { AuthUser } from '../types.js';

export const loginSchema = z.object({
  email: z.string().email('メールアドレスの形式が正しくありません'),
  password: z.string().min(8, '8文字以上で入力してください'),
});

export const registerSchema = z.object({
  name: z.string().min(1, '名前を入力してください'),
  email: z.string().email('メールアドレスの形式が正しくありません'),
  password: z.string().min(8, '8文字以上で入力してください'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken は必須です'),
});

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * セッションを発行する共通処理。
 * 短命アクセストークン(JWT)とリフレッシュトークンを発行し、リフレッシュトークンの
 * ハッシュを DB に上書き保存する(後勝ち方式: 最後にログインした端末のみ有効)。
 */
async function issueSession(user: User): Promise<LoginResult> {
  const token = await issueToken(user.id);
  const refreshToken = generateRefreshToken();
  await userRepository.updateRefreshToken(
    user.id,
    hashRefreshToken(refreshToken),
    refreshTokenExpiresAt(),
  );

  return {
    token,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export const authService = {
  /**
   * 新規登録処理。
   * パスワードを Argon2id でハッシュ化して保存し、login と同様にセッションを発行する（自動ログイン）。
   */
  async register(input: unknown): Promise<LoginResult> {
    const { name, email, password } = validate(registerSchema, input);

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw conflict({ email: 'このメールアドレスは既に登録されています' });
    }

    const user = await userRepository.create({
      name,
      email,
      password: await hashPassword(password),
    });

    return issueSession(user);
  },

  /**
   * ログイン処理。
   * 認証成功時に新しいセッションを発行し、リフレッシュトークンを上書きする（後勝ち方式）。
   */
  async login(input: unknown): Promise<LoginResult> {
    const { email, password } = validate(loginSchema, input);

    const user = await userRepository.findByEmail(email);
    if (!user || !(await verifyPassword(user.password, password))) {
      throw unauthorized('メールアドレスまたはパスワードが正しくありません');
    }

    return issueSession(user);
  },

  /**
   * トークンリフレッシュ処理。
   * 有効なリフレッシュトークンと引き換えに、新しいアクセストークンとリフレッシュトークンを
   * 発行する(ローテーション: 使用済みリフレッシュトークンは即座に無効化される)。
   */
  async refresh(input: unknown): Promise<LoginResult> {
    const { refreshToken } = validate(refreshSchema, input);

    const user = await userRepository.findByRefreshTokenHash(hashRefreshToken(refreshToken));
    if (!user || !user.refreshTokenExpiresAt || user.refreshTokenExpiresAt < new Date()) {
      throw unauthorized('リフレッシュトークンが無効です');
    }

    return issueSession(user);
  },

  /** ログアウト処理。サーバー側のリフレッシュトークンを破棄する。 */
  async logout(userId: number): Promise<void> {
    await userRepository.updateRefreshToken(userId, null, null);
  },
};
