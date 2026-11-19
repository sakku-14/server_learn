# 全世界配信を見据えたバックエンド改善方針

> ステータス: **Phase 1 + Phase 2 実装済み**(2026-07-03 承認・実装完了。Phase 3・4 は未着手)
> 作成日: 2026-07-03
>
> 補足(実装時の判断):
> - ログはコンテナのベストプラクティスに合わせ、本番では stdout の JSON のみに変更(ファイル出力は開発時のみ)
> - Flutter 側は `LoginResponse` に `refreshToken` を追加済み。**401 時に refresh → リトライする Dio インターセプター対応が未実装**のため、現状アプリはアクセストークン失効(15分)後に再ログインが必要。次の対応候補
> 対象: `server/`(Hono + Prisma + PostgreSQL + TypeScript)

## 背景

このアプリは全世界に配信する予定。現状のバックエンドはレイヤー分離(Route → Controller → Service → Repository)、Zodバリデーション、pino構造化ログ、OpenAPI自動生成、APIバージョニングなど土台は良い。一方で、本番投入には致命的なギャップ(パスワード平文保存など)と、グローバル配信特有の考慮(低レイテンシ、多言語、運用体制)が不足している。

本ドキュメントは、業界のベストプラクティス・トレンドを踏まえた改善項目を優先度順に整理したもの。

## 全体像(優先度順)

| Phase | テーマ | 内容 | 今回のスコープ |
|---|---|---|---|
| 1 | セキュリティ(本番前に必須) | パスワードハッシュ化、JWT有効期限+リフレッシュ、レートリミット、secure headers、シークレット検証 | ✅ 実装する |
| 2 | 運用基盤 | CI (GitHub Actions)、Dockerfile、graceful shutdown、DB込みヘルスチェック、統合テスト | ✅ 実装する |
| 3 | グローバル対応 | エラーコードベースの多言語戦略、デプロイ構成、GDPR的配慮 | 📖 方針のみ(デプロイ先確定後に着手) |
| 4 | 開発体験 | OpenAPI→Flutterクライアント自動生成、ページネーション規約、監視 | 📖 ロードマップとして記載 |

---

## Phase 1: セキュリティ(必須)

### 1-1. パスワードのハッシュ化(最重要)

- **なぜ**: 現在 `src/services/authService.ts` で平文保存・平文比較している。DBが流出したら全ユーザーのパスワードがそのまま漏れる。多くのユーザーはパスワードを他サービスと使い回すため、被害が自サービスに留まらない。世界配信では絶対にNG。
- **どうやる**: `@node-rs/argon2` を導入(Argon2id は現在の推奨アルゴリズム。bcryptより新しく、GPUによる総当たりに強い)。
  - `src/lib/password.ts` を新設: `hashPassword()` / `verifyPassword()`
  - `authService.register` でハッシュ化して保存、`login` で `verifyPassword` で比較
  - 既存データは開発用シードのみなので `prisma/seed.ts` をハッシュ化対応に更新し、`make reset` で作り直す
  - `tests/services/authService.test.ts` を更新

### 1-2. JWT有効期限 + リフレッシュトークン

- **なぜ**: 現在のJWTは `exp`(有効期限)なし=一度盗まれたら永久に有効。業界標準は「短命アクセストークン + 長命リフレッシュトークン」の2段構え。トークンが漏れても15分で無効になる。
- **どうやる**(既存の single-session「後勝ち」設計を活かす):
  - **アクセストークン**: `exp` 15分。毎リクエストのDB照合を**やめ**、署名+expのみで検証(DBアクセス削減=グローバル配信時のレイテンシ改善にも効く)
  - **リフレッシュトークン**: ランダム値のハッシュをDBに保存(`refresh_token_hash`, `refresh_token_expires_at` 30日)。ログイン毎に上書きするので single-session の性質は維持
  - `POST /auth/refresh` エンドポイントを追加。ログアウトはリフレッシュトークンの破棄
  - Prisma マイグレーション1本追加
  - Flutter側は将来 `auth_interceptor.dart` で「401 → refresh → リトライ」対応が必要(今回はサーバー側中心、レスポンスへの `refreshToken` 追加と最小限のDTO更新まで)

### 1-3. レートリミット

- **なぜ**: 世界に公開したエンドポイントは確実にbot攻撃を受ける。特に `/auth/login` へのブルートフォース(パスワード総当たり)対策は必須。
- **どうやる**: `hono-rate-limiter` を導入。`/auth/login`・`/auth/register` に厳しめ(例: 10回/分/IP)、API全体に緩め(例: 100回/分)を適用。ストアは当面インメモリ(単一インスタンス前提)とし、スケールアウト時はRedisに差し替える旨をコードにコメントで明記。

### 1-4. secure headers + CORS絞り込み

- **なぜ**: HSTS等のブラウザ防御ヘッダが無く、CORSが全オリジン許可(`*`)。モバイルアプリ自体はCORSの対象外だが、`/reference`(APIドキュメントUI)などブラウザからアクセスされる経路がある。
- **どうやる**: `src/index.ts` に `hono/secure-headers` ミドルウェアを追加。CORSは環境変数 `CORS_ORIGINS` の許可リスト方式に変更(開発時はlocalhostを許可)。

### 1-5. 本番でのシークレット検証強化

- **なぜ**: 現在 `JWT_SECRET=dev-local-secret-change-me`(Makefileの開発デフォルト)のまま本番起動できてしまう。推測可能なシークレット=誰でもトークンを偽造できる。
- **どうやる**: `src/config/env.ts` の Zod スキーマで、`NODE_ENV=production` のときは JWT_SECRET が開発デフォルト値または32文字未満なら起動を失敗させる。

## Phase 2: 運用基盤

### 2-1. CI (GitHub Actions)

- **なぜ**: 世界配信では壊れたコードのデプロイが即・全ユーザーに影響する。push毎の自動チェック(lint / 型 / テスト)は業界の最低ライン。
- **どうやる**: `.github/workflows/ci.yml` を新設。ジョブ構成: `lint` → `tsc build` → `vitest`(Postgres service container を立てて prisma migrate も検証)。Node 22(`.nvmrc` 準拠)。

### 2-2. Dockerfile + graceful shutdown

- **なぜ**: アプリ本体がコンテナ化されておらず、どのクラウドにも載せられない。また SIGTERM を処理しないと、デプロイ・スケールイン時に処理中のリクエストがぶつ切りになる。
- **どうやる**:
  - `server/Dockerfile`: multi-stage ビルド(build → `node:22-slim` 実行、prisma generate 込み、非rootユーザーで実行)
  - `src/index.ts`: `serve()` の戻り値を保持し、SIGTERM/SIGINT で `server.close()` → `prisma.$disconnect()` の順に終了
  - `.dockerignore` を追加

### 2-3. ヘルスチェック強化

- **なぜ**: ロードバランサやオーケストレータが「プロセスは生きているがDBに繋がらない」インスタンスを検知して切り離せるようにするため。liveness(生死)と readiness(受け入れ可否)を分けるのが定石。
- **どうやる**: `/health`(liveness、現状維持)に加えて `/health/ready`(readiness、`SELECT 1` でDB疎通確認)を追加。

### 2-4. 統合テスト(ルートレベル)

- **なぜ**: 現在はサービス層のモックテストのみで、認証ミドルウェア・エラー契約・ルーティングの「結合部分」が未検証。リファクタ時の安全網として重要。
- **どうやる**: Hono の `app.request()` を使い、`tests/routes/auth.test.ts` で register → login → me → logout のハッピーパスと主要エラー(401 / 409 / バリデーション)を検証。DBは docker-compose の Postgres にテスト用スキーマを使用(`tests/setup.ts` を拡張)。

## Phase 3: グローバル対応(方針)

- **多言語エラー**: サーバーが言語別メッセージを持つのではなく、機械可読な `code`(既に `{code, detail}` 契約で実装済み)を返して **Flutter側で翻訳する** のが現代の定石。サーバーの翻訳保守が不要になり、アプリのi18n機構に一元化できる。
- **日時**: Prisma は UTC 保存・ISO8601 返却で既に正しい。この規約を README に明文化する。
- **デプロイ推奨**(未定のため提案): **コンテナ + マネージドPostgres** が最も現実的。
  - 第1候補: **Google Cloud Run + Neon(または Cloud SQL)**。リクエスト課金・ゼロへの自動スケール・後からのマルチリージョン展開が可能
  - エッジ(Cloudflare Workers)は Hono と相性抜群だが、Prisma + Postgres の接続に Hyperdrive / Accelerate 等の工夫が必要で難度が上がるため次のステップとする
  - 低レイテンシ化の進め方: まず1リージョン + CDN → 需要が出たらリードレプリカ / マルチリージョン
- **GDPR的配慮**: 退会API(`DELETE /users/me`)は実装済み。ログに email 等の個人情報(PII)を出していないか点検し、出していれば除去。

## Phase 4: 開発体験(ロードマップ)

- OpenAPI(`/doc`)から Flutter の Dio クライアントを自動生成(openapi-generator)し、現在の手動整合を撤廃
- リスト系API追加時のカーソルベース・ページネーション規約
- OpenTelemetry / Sentry による監視・トレーシング(デプロイ先確定後)

---

## 変更ファイル一覧(主要)

- **修正**: `src/services/authService.ts`, `src/lib/jwt.ts`, `src/middlewares/auth.ts`, `src/routes/authRoutes.ts`, `src/controllers/authController.ts`, `src/config/env.ts`, `src/index.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, `tests/services/authService.test.ts`
- **新規**: `src/lib/password.ts`, `prisma/migrations/*`(refresh token), `.github/workflows/ci.yml`, `Dockerfile`, `.dockerignore`, `tests/routes/auth.test.ts`
- **依存追加**: `@node-rs/argon2`, `hono-rate-limiter`

## 検証方法

1. `make up` でDB+サーバー起動、`make reset` でシード再投入
2. curl で end-to-end 確認: register → login(ハッシュ化後も成功、レスポンスに refreshToken)→ `GET /users/me` → 期限切れトークンで401 → `POST /auth/refresh` で再取得 → logout 後は refresh も401
3. `/auth/login` に連続リクエストして 429 が返ること
4. `NODE_ENV=production JWT_SECRET=dev-local-secret-change-me` で起動が失敗すること
5. `make test`(ユニット+新統合テスト)、`make lint` がパスすること
6. `docker build` → コンテナ起動 → `/health/ready` が200、SIGTERM で正常終了すること
7. GitHub に push して CI がグリーンになること
