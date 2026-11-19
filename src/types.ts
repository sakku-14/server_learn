import type { Logger } from 'pino';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

/** Hono の Context に格納する共有値の型定義。 */
export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
    /** 認証ミドルウェアが JWT から取り出したユーザー ID(プロフィールは必要時に DB から取得する)。 */
    user: { id: number };
  };
}
