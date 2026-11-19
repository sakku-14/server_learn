import { serve } from '@hono/node-server';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { app } from './app.js';

// 実機・エミュレータからも到達できるよう全インターフェイスで待ち受ける。
const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  logger.info(`Server running on port ${info.port}`);
});

/**
 * グレースフルシャットダウン。
 * デプロイ・スケールイン時に SIGTERM を受けたら、新規受付を止めて処理中のリクエストを
 * 完了させてから終了する(即死させるとクライアントにエラーが返る)。
 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info(`${signal} を受信しました。グレースフルシャットダウンを開始します`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // 接続が残り続けた場合の保険として一定時間で強制終了する。
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
