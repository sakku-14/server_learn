import { z } from 'zod';
import { validationError } from './errors.js';

/**
 * Zod のエラー issues を { フィールド名: メッセージ } 形式の detail に変換する。
 * service 層の validate() と OpenAPI ルートの defaultHook で共通利用する。
 */
export function zodIssuesToDetail(issues: z.ZodIssue[]): Record<string, string> {
  const detail: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '_';
    if (!detail[key]) detail[key] = issue.message;
  }
  return detail;
}

/**
 * Zod スキーマで入力を検証する。
 * 失敗時は { フィールド名: メッセージ } 形式の detail を持つ VALIDATION_ERROR を投げる。
 */
export function validate<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(zodIssuesToDetail(result.error.issues));
  }
  return result.data;
}
