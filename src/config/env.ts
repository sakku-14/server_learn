import 'dotenv/config';
import { z } from 'zod';

/** Makefile が生成するローカル開発用のデフォルト値。本番での使用は起動時に拒否する。 */
const DEV_JWT_SECRET = 'dev-local-secret-change-me';

// 環境変数を起動時に検証する。不正な場合は即座に終了させる。
const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL は必須です'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET は必須です'),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /** CORS で許可するオリジン(カンマ区切り)。未設定時、開発環境では localhost のみ許可する。 */
    CORS_ORIGINS: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // 本番で推測可能なシークレットを使うとトークンを誰でも偽造できるため、起動を拒否する。
    if (value.NODE_ENV === 'production') {
      if (value.JWT_SECRET === DEV_JWT_SECRET || value.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message:
            '本番環境では JWT_SECRET に32文字以上のランダムな値を設定してください(開発用デフォルト値は使用できません)',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('環境変数の読み込みに失敗しました:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
