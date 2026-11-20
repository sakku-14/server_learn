import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // 統合テスト(tests/routes)は同じ test スキーマを TRUNCATE して使うため、ファイル間で並列実行しない。
    fileParallelism: false,
  },
});
