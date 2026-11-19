import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

/**
 * 共通エラーハンドラー。
 * すべての例外をここに集約し、統一されたエラーレスポンス形式 { code, detail } で返す。
 * 各所に try/catch を書かず、ここで一元管理する。
 */
export function errorHandler(err: Error, c: Context<AppEnv>): Response {
  const log = c.get('logger') ?? console;

  if (err instanceof AppError) {
    // 業務上想定されるエラー。INFO/WARN レベルで記録する。
    log.info({ code: err.code, status: err.status }, err.message);
    return c.json({ code: err.code, detail: err.detail }, err.status);
  }

  if (err instanceof HTTPException) {
    log.warn({ status: err.status }, err.message);
    return c.json({ code: 'INTERNAL_ERROR', detail: { message: err.message } }, err.status);
  }

  // 想定外のエラー。スタックトレース付きで ERROR レベルで記録する。
  log.error({ err }, '未処理のエラーが発生しました');
  return c.json(
    { code: 'INTERNAL_ERROR', detail: { message: 'サーバー内部でエラーが発生しました' } },
    500,
  );
}
