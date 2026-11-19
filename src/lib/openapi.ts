import { OpenAPIHono, z } from '@hono/zod-openapi';
import { validationError } from './errors.js';
import { zodIssuesToDetail } from './validation.js';
import type { AppEnv } from '../types.js';

/** Bearer 認証スキームの登録名。protected ルートの security で参照する。 */
export const BEARER_AUTH = 'Bearer';

/**
 * OpenAPIHono インスタンスを生成するファクトリ。
 * defaultHook でリクエストのバリデーション失敗を既存のエラー契約 { code, detail } に
 * 揃える（service 層の validate() と同じ VALIDATION_ERROR を投げる）。
 */
export function createOpenAPIApp(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw validationError(zodIssuesToDetail(result.error.issues));
      }
    },
  });
}

/** 全エンドポイント共通の Api-Version ヘッダー。実際の検証は apiVersion ミドルウェアが担う。 */
export const apiVersionHeader = z.object({
  'api-version': z.string().openapi({
    example: '1',
    description: 'API バージョン（現在は 1 のみ対応）。ヘッダー名は大文字小文字を区別しない。',
  }),
});

/** 統一エラーレスポンス { code, detail }。 */
export const ErrorSchema = z
  .object({
    code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
    detail: z
      .union([z.record(z.string()), z.object({ message: z.string() })])
      .openapi({ example: { message: 'エラーの詳細' } }),
  })
  .openapi('Error');

/** JSON エラーレスポンス定義を組み立てるヘルパー。 */
export function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: ErrorSchema } },
  };
}
