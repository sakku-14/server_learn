import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import pino from 'pino';
import { isProduction } from '../config/env.js';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_RETENTION_DAYS = 30;

/** YYYYMMDD 形式の日付文字列を返す。 */
function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 日次でファイルを切り替えるログ出力ストリーム。
 * - 書き込みのたびに当日の日付を確認し、変わっていれば新しいファイルへ切り替える。
 * - ファイル名は `logs/YYYYMMDD.log`。
 */
class DailyRotatingFileStream extends Writable {
  private currentKey: string | null = null;
  private fd: number | null = null;

  private ensureFile(): void {
    const key = dateKey();
    if (key === this.currentKey && this.fd !== null) return;

    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
    fs.mkdirSync(LOG_DIR, { recursive: true });
    this.fd = fs.openSync(path.join(LOG_DIR, `${key}.log`), 'a');
    this.currentKey = key;
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    try {
      this.ensureFile();
      fs.writeSync(this.fd!, chunk);
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }
}

/** 30日以上前のログファイルを削除する。 */
function cleanupOldLogs(): void {
  if (!fs.existsSync(LOG_DIR)) return;
  const threshold = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(LOG_DIR)) {
    const match = /^(\d{8})\.log$/.exec(file);
    if (!match) continue;
    const day = match[1];
    const fileDate = new Date(
      Number(day.slice(0, 4)),
      Number(day.slice(4, 6)) - 1,
      Number(day.slice(6, 8)),
    );
    if (fileDate.getTime() < threshold) {
      fs.rmSync(path.join(LOG_DIR, file), { force: true });
    }
  }
}

// 開発時は pino-pretty でコンソールに見やすく、本番時は JSON でコンソールに出力する。
const consoleStream: pino.StreamEntry = isProduction
  ? { stream: process.stdout }
  : {
      stream: pino.transport({
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      }),
    };

// ファイルへの永続化は開発時のみ。本番(コンテナ)のファイルシステムは一時的で
// 再起動で消えるため、stdout の JSON を実行基盤(Cloud Run / k8s 等)に収集させる。
const streams: pino.StreamEntry[] = [consoleStream];
if (!isProduction) {
  cleanupOldLogs();
  streams.push({ stream: new DailyRotatingFileStream() });
}

export const logger = pino(
  {
    level: isProduction ? 'info' : 'debug',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream(streams),
);
