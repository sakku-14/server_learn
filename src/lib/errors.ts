import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** 統一エラーレスポンスのコード。 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/**
 * アプリケーション共通の例外。
 * Service / Middleware からこれを throw し、エラーハンドラーミドルウェアで一元的にレスポンス化する。
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly detail: unknown;

  constructor(code: ErrorCode, status: ContentfulStatusCode, detail: unknown, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const unauthorized = (message = '認証に失敗しました') =>
  new AppError('UNAUTHORIZED', 401, { message }, message);

export const notFound = (message = 'リソースが見つかりません') =>
  new AppError('NOT_FOUND', 404, { message }, message);

export const conflict = (detail: Record<string, string>) =>
  new AppError('CONFLICT', 409, detail, 'リソースが競合しています');

export const tooManyRequests = (message = 'リクエストが多すぎます。しばらくしてから再試行してください') =>
  new AppError('RATE_LIMITED', 429, { message }, message);

export const validationError = (detail: Record<string, string>) =>
  new AppError('VALIDATION_ERROR', 400, detail, 'バリデーションエラー');
