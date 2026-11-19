import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

const SUPPORTED_VERSIONS = ['1'];

/**
 * API バージョニング。
 * クライアントは全リクエストに `Api-Version: 1` ヘッダーを付与する。
 * 未指定・非対応バージョンの場合は 400 を返す。
 */
export const apiVersion = createMiddleware<AppEnv>(async (c, next) => {
  const version = c.req.header('Api-Version');

  if (!version) {
    throw new AppError('VALIDATION_ERROR', 400, {
      'Api-Version': 'Api-Version ヘッダーは必須です',
    });
  }

  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new AppError('VALIDATION_ERROR', 400, {
      'Api-Version': `非対応のバージョンです (対応: ${SUPPORTED_VERSIONS.join(', ')})`,
    });
  }

  await next();
});
