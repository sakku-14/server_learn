// テスト用の環境変数。
// ユニットテストは DB へ接続しない。統合テスト(tests/routes)は docker-compose の
// Postgres 上の専用スキーマ(test)を使い、開発データ(public スキーマ)とは分離する。
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://app:app@localhost:5432/app?schema=test';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '3000';
