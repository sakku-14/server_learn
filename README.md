# app backend

スマホアプリ(iOS)向けのバックエンド API。
新規登録 / ログイン / トークン再発行 / ログアウト / プロフィール確認・名前変更 / 退会 の機能を提供する。

設計の詳細は [`project-context.md`](./project-context.md) を参照。

## 技術スタック

| 項目 | 採用 |
|---|---|
| 言語 | TypeScript |
| フレームワーク | Hono |
| 実行環境 | Node.js (ローカル実行) |
| DB | PostgreSQL (Docker) |
| ORM | Prisma |
| バリデーション | Zod |
| 認証 | JWT アクセストークン (15分) + リフレッシュトークン (30日 / 後勝ち方式) |
| パスワード | Argon2id でハッシュ化して保存 |
| API ドキュメント | OpenAPI 3.1 + Scalar (`@hono/zod-openapi` でコードから自動生成) |
| テスト | Vitest |
| ロガー | pino |

## ディレクトリ構成

```
src/
  ├── routes/        # エンドポイント定義
  ├── controllers/   # リクエスト・レスポンス処理
  ├── services/      # ビジネスロジック
  ├── repositories/  # DB 操作 (Prisma)
  ├── middlewares/   # 認証 / APIバージョン / エラーハンドラ / リクエストログ
  ├── lib/           # logger, prisma, jwt, errors, validation, openapi
  ├── config/        # 環境変数の検証
  ├── types.ts       # 共有型 (Hono Context の型定義など)
  ├── app.ts         # Hono アプリ本体 (ミドルウェア / ルート登録)
  └── index.ts       # エントリーポイント
prisma/
  ├── schema.prisma  # DB スキーマ
  ├── migrations/    # マイグレーション SQL
  └── seed.ts        # 開発用シードデータ
tests/
  ├── setup.ts       # テスト用環境変数の設定
  ├── services/      # Service 層のユニットテスト (DB 不要)
  └── routes/        # ルートレベルの統合テスト (実 DB 使用)
docs/
  ├── guide/         # コードリーディング / 拡張方法のガイド (HTML)
  └── backend-improvement-plan.md  # バックエンド改善計画
logs/                # 日次ログファイル (開発時のみ / Git 管理外)
```

---

## 前提

- **Node.js 18 以上** (開発・動作確認は v22 で実施)
- **Docker** (PostgreSQL をコンテナで起動)

> このリポジトリには `.nvmrc` (Node 22) を同梱しています。nvm 利用時は `nvm use` でバージョンを合わせられます。

---

## 起動方法

### Make を使う場合 (推奨)

`Makefile` を用意しているので、起動・終了はこれだけでよい。初回セットアップ
(依存インストール / `.env` 生成 / マイグレーション / シード) も `make up` が自動で実行する。

```bash
make up      # 起動: 初回セットアップ込み。DB を上げて開発サーバーを前面実行 (停止は Ctrl+C)
make down    # 終了: DB コンテナを停止 (データは残る)
make help    # 使えるコマンド一覧を表示
```

その他のよく使うコマンド:

| コマンド | 内容 |
|---|---|
| `make setup` | DB 起動 + マイグレーション + シードまで実行 (開発サーバーは起動しない) |
| `make test` | DB を起動してからテストを実行 |
| `make reset` | DB を全削除 → 再マイグレーション → 再シード |
| `make fclean` | コンテナ + DB データ + `node_modules` / `dist` を削除 (完全初期化) |

> `make up` は開発サーバーをそのターミナルで前面実行する (ホットリロードのログが見える)。
> サーバーを止めるときは `Ctrl + C`、DB も止めるときは続けて `make down`。

手動で 1 コマンドずつ実行したい場合は、以下の手順を参照。

### 初回起動 (まだ一度もセットアップしていない場合)

下の「環境構築手順」を 1〜7 まで順に実行する。要点だけまとめると次のとおり。

```bash
nvm use                          # 1. Node 22 に切り替え
npm install                      # 2. 依存パッケージをインストール
cp .env.example .env             # 3. 環境変数ファイルを作成し、中身を設定 (下記参照)
docker compose up -d             # 4. PostgreSQL (DB) をコンテナで起動
npm run prisma:migrate           # 5. DB にテーブルを作成 (既存のマイグレーションを適用)
npm run db:seed                  # 6. 動作確認用のテストユーザーを投入
npm run dev                      # 7. サーバー起動
```

### 2 回目以降の起動 (セットアップ済みの場合)

普段の開発でサーバーを立ち上げるときは、この 2 つだけでよい。

```bash
docker compose up -d   # DB コンテナを起動 (停止していた場合)
npm run dev            # サーバー起動 (http://localhost:3000)
```

> `npm run dev` はソースを保存すると自動で再起動する (ホットリロード)。開発中はこれを使う。

### 起動できたかの確認

別のターミナルで次を実行し、`{"status":"ok"}` が返ればサーバーは正常稼働している。

```bash
curl http://localhost:3000/health
```

### サーバーの停止

サーバーを動かしているターミナルで `Ctrl + C`。DB コンテナも止める場合は `docker compose down`(データは残る)。

---

## 環境構築手順

### 1. Node のバージョンを合わせる (nvm 利用時)

```bash
nvm use      # .nvmrc の Node 22 を使用
```

### 2. 依存パッケージをインストール

```bash
npm install
```

### 3. 環境変数ファイルを用意

`.env.example` をコピーして `.env` を作成する。

```bash
cp .env.example .env
```

`.env` に以下を設定する (ローカル開発のデフォルト値):

```bash
DATABASE_URL="postgresql://app:app@localhost:5432/app?schema=public"
JWT_SECRET="dev-local-secret-change-me"
PORT=3000
```

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | PostgreSQL への接続文字列 |
| `JWT_SECRET` | JWT 署名用のシークレット。**本番では32文字以上のランダム値が必須**(開発用デフォルト値のままだと起動に失敗する) |
| `PORT` | サーバーの待ち受けポート (デフォルト 3000) |
| `CORS_ORIGINS` | CORS で許可するオリジン(カンマ区切り、任意)。開発環境では未設定でも localhost が許可される |
| `NODE_ENV` | `development` (デフォルト) / `production` / `test`。`production` では `JWT_SECRET` の強度チェックが有効になり、ログは stdout への JSON のみになる。`test` ではレートリミットが無効になる |

> `.env` は Git 管理外です。共有が必要な変数は `.env.example` に空値で追記してください。

### 4. PostgreSQL を起動 (Docker)

```bash
docker compose up -d
```

`docker-compose.yml` で以下のコンテナが起動する。

- イメージ: `postgres:16-alpine`
- ユーザー / パスワード / DB 名: すべて `app`
- ポート: `5432`
- データは名前付きボリューム `app-pgdata` に永続化

起動確認:

```bash
docker compose ps
```

停止 / 破棄:

```bash
docker compose down        # コンテナ停止 (データは残る)
docker compose down -v      # コンテナ + データ削除
```

### 5. マイグレーション + Prisma Client 生成

```bash
npm run prisma:migrate      # マイグレーション適用 + Client 自動生成
```

(後述の「マイグレーション手順」を参照)

### 6. シードデータ投入

```bash
npm run db:seed
```

開発用に以下の 3 ユーザーが投入される (パスワードはすべて `password123`。投入時に Argon2id でハッシュ化して保存される)。

| id | name | email | password |
|---|---|---|---|
| 1 | テストユーザー1 | test1@example.com | password123 |
| 2 | テストユーザー2 | test2@example.com | password123 |
| 3 | テストユーザー3 | test3@example.com | password123 |

あわせて投稿 (`posts`) が 4 件投入される (id=1〜4、投稿者は上記ユーザー。id=4 は `tags` が空配列)。
アプリは現在 `GET /posts/1` を固定で呼ぶため、id=1 は削除しないこと。

### 7. サーバー起動

```bash
npm run dev        # tsx watch でホットリロード起動
```

`http://localhost:3000` で待ち受ける。動作確認:

```bash
curl http://localhost:3000/health
# => {"status":"ok"}
```

> 起動方法のまとめ(初回 / 2 回目以降 / 停止)は冒頭の [「起動方法」](#起動方法) を参照。

---

## マイグレーション手順

スキーマ変更は Prisma の `migrate` コマンドで行う。

### 開発環境での適用 (マイグレーション作成 + 適用)

`prisma/schema.prisma` を編集したあと、次を実行する。

```bash
npx prisma migrate dev --name <変更内容>
# 例: npx prisma migrate dev --name add_user_phone
```

これにより以下が行われる。

1. `prisma/migrations/` に新しいマイグレーション SQL が生成される
2. DB に適用される
3. Prisma Client が再生成される

短縮スクリプト (名前は対話で聞かれる):

```bash
npm run prisma:migrate
```

### Prisma Client のみ再生成

```bash
npm run prisma:generate
```

### 本番 / CI での適用 (既存マイグレーションの適用のみ)

```bash
npx prisma migrate deploy
```

### DB をリセット (全削除 → 再マイグレーション → シード)

```bash
npx prisma migrate reset
```

> `migrate reset` は `package.json` の `prisma.seed` 設定により、リセット後に自動で `prisma/seed.ts` を実行する。

### DB の中身を GUI で確認 (Prisma Studio)

```bash
npm run prisma:studio
```

---

## npm スクリプト一覧

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 (ホットリロード) |
| `npm run build` | TypeScript を `dist/` にビルド |
| `npm start` | ビルド済みサーバーを起動 |
| `npm test` | ユニットテスト + 統合テストを実行 (事前に DB の起動が必要) |
| `npm run test:watch` | テストをウォッチ実行 |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run prisma:migrate` | マイグレーション (dev) |
| `npm run prisma:generate` | Prisma Client 生成 |
| `npm run prisma:studio` | Prisma Studio 起動 |
| `npm run db:seed` | シードデータ投入 |

---

## API 仕様

### API ドキュメント (Scalar / OpenAPI)

API 仕様書はコードから自動生成される。サーバー起動後、以下にアクセスできる。

| URL | 内容 |
|---|---|
| http://localhost:3000/reference | **Scalar の API ドキュメント UI**(これが API 仕様書。ブラウザで閲覧する) |
| http://localhost:3000/doc | OpenAPI 3.1 形式の仕様 (JSON)。クライアントのコード生成や Postman 取り込みに使える |

各エンドポイントの Zod スキーマがそのまま仕様の元になっているため、**実装と仕様書がズレない**。
新しいエンドポイントを `createRoute` で定義すれば、ドキュメントにも自動で反映される。
仕組みと導入理由の詳細は [`.claude/BUILD_GUIDE.md`](./.claude/BUILD_GUIDE.md) の「API 仕様書の自動生成」を参照。

すべてのリクエストに `Api-Version: 1` ヘッダーを付与する (`/health` を除く)。
認証が必要なエンドポイントは `Authorization: Bearer <token>` を付与する。

| メソッド | パス | 認証 | 概要 |
|---|---|---|---|
| GET | `/health` | 不要 | ヘルスチェック (liveness: プロセスの生死) |
| GET | `/health/ready` | 不要 | ヘルスチェック (readiness: DB 疎通込み) |
| POST | `/auth/register` | 不要 | 新規登録・トークン発行 (自動ログイン) |
| POST | `/auth/login` | 不要 | ログイン・トークン発行 |
| POST | `/auth/refresh` | 不要* | リフレッシュトークンでアクセストークンを再発行 |
| POST | `/auth/logout` | 必要 | ログアウト・リフレッシュトークン破棄 |
| GET | `/users/me` | 必要 | プロフィール取得 |
| PATCH | `/users/me` | 必要 | プロフィール更新 (名前の変更) |
| DELETE | `/users/me` | 必要 | 退会・ユーザー削除 (そのユーザーの投稿も削除) |
| GET | `/posts/{id}` | 必要 | 投稿詳細取得 |

*`/auth/refresh` は Bearer トークンの代わりにボディの `refreshToken` で認証する。

### レスポンス形式

成功時はデータをそのまま返す (ラッパーなし)。エラー時は統一形式で返す。

```json
{
  "code": "VALIDATION_ERROR",
  "detail": { "email": "メールアドレスの形式が正しくありません" }
}
```

| ステータス | ケース |
|---|---|
| 200 | 成功 (取得・更新) |
| 201 | 成功 (作成: 新規登録) |
| 204 | 成功 (削除) |
| 400 | バリデーションエラー |
| 401 | 認証エラー |
| 404 | リソースなし |
| 409 | 競合 (メールアドレス重複など / `CONFLICT`) |
| 429 | レートリミット超過 (`RATE_LIMITED`) |
| 500 | サーバーエラー |

日時はすべて **UTC で保存し、ISO 8601 形式で返す**(タイムゾーン変換はクライアント側で行う)。
エラーメッセージの多言語化はサーバーでは行わず、機械可読な `code` を基にクライアント側で翻訳する方針。

### リクエスト例 (curl)

```bash
# 新規登録 (レスポンスは login と同じ形式。登録と同時にログイン状態になる)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -H "Api-Version: 1" \
  -d '{"name":"山田太郎","email":"new@example.com","password":"password123"}'

# ログイン
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "Api-Version: 1" \
  -d '{"email":"test1@example.com","password":"password123"}'
# => {"token":"<アクセストークン>","refreshToken":"<リフレッシュトークン>","id":1,"name":"テストユーザー1","email":"test1@example.com"}

# トークン再発行 (使った refreshToken は無効になるので、レスポンスの新しい値に置き換える)
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -H "Api-Version: 1" \
  -d '{"refreshToken":"<REFRESH_TOKEN>"}'

# プロフィール取得 (TOKEN は login のレスポンスの token)
curl http://localhost:3000/users/me \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <TOKEN>"

# プロフィール更新 (名前の変更。前後の空白は除去され、1〜50 文字)
curl -X PATCH http://localhost:3000/users/me \
  -H "Content-Type: application/json" \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"新しい名前"}'
# => {"id":1,"name":"新しい名前","email":"test1@example.com"}

# ログアウト
curl -X POST http://localhost:3000/auth/logout \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <TOKEN>"

# 投稿詳細取得
curl http://localhost:3000/posts/1 \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <TOKEN>"
# => {"id":1,"title":"...","body":"...","tags":["history","american","crime"],"reactions":{"likes":192,"dislikes":25},"views":305,"userId":1}

# 退会
curl -X DELETE http://localhost:3000/users/me \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <TOKEN>"
```

VSCode の REST Client / Postman でも同様にテストできる。

---

## 認証の仕組み (アクセストークン + リフレッシュトークン)

- ログイン成功時に **アクセストークン (JWT / 有効期限15分)** と **リフレッシュトークン (ランダム値 / 有効期限30日)** を発行する。
- アクセストークンは **署名と有効期限のみで検証** し、DB は参照しない (リクエスト毎の DB アクセスを削減)。
- リフレッシュトークンは SHA-256 ハッシュを `users.refresh_token_hash` に保存する (DB 流出対策)。
- アクセストークンが切れたら `POST /auth/refresh` で再発行する。このとき **リフレッシュトークンもローテーション** され、使用済みのものは即座に無効になる。
- 再ログインするとリフレッシュトークンが上書きされる (**後勝ち方式**: 古い端末は次のリフレッシュで弾かれる)。
- ログアウト時はリフレッシュトークンを破棄する。
- パスワードは **Argon2id でハッシュ化** して保存する (平文は保存しない)。
- ブルートフォース対策として認証系エンドポイントに **レートリミット (10回/分/IP)**、API 全体に 100回/分/IP を適用 (ストアはインメモリのため単一インスタンス前提。スケールアウト時は Redis 等へ差し替え)。

---

## ログ

- `pino` を使用。開発時は `pino-pretty` でコンソール整形出力 + ファイルへ JSON。本番はコンソール (stdout) への JSON のみ (収集は実行基盤に任せる)。
- 開発時は `logs/YYYYMMDD.log` に日次で出力 (日付が変わると自動で切り替え)。
- 全ログにリクエスト ID (UUID) を付与し、レスポンスには `X-Request-Id` ヘッダーを返す。
- 起動時に 30 日以上前のログファイルを自動削除する。
- `logs/` は Git 管理外。
- パスワード / トークンの中身 / 個人情報はログに記録しない。

---

## テスト

```bash
docker compose up -d   # 統合テストが DB を使うため先に起動しておく
npm test

# または、DB 起動からまとめて実行
make test
```

| 種類 | 配置 | 内容 |
|---|---|---|
| ユニットテスト | `tests/services/` | Service 層のテスト。Repository は `vi.mock` で差し替え、DB には接続しない |
| 統合テスト | `tests/routes/` | `app.request()` で HTTP レイヤーから実 DB まで通しで検証する |

- 統合テストは docker-compose の Postgres 上の **`test` スキーマ** を使うため、開発データ (`public` スキーマ) には影響しない。
- 接続先を変えたい場合は `TEST_DATABASE_URL` を指定する (未指定時は `postgresql://app:app@localhost:5432/app?schema=test`)。
- テスト用の環境変数は `tests/setup.ts` で設定される (`NODE_ENV=test` のためレートリミットは無効)。

---

## Docker イメージ (本番用)

`Dockerfile` はマルチステージビルドで、本番実行に必要なものだけを含む最小イメージを作る。

```bash
docker build -t app-backend .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  app-backend
```

- イメージ内では `NODE_ENV=production` が設定済み (`JWT_SECRET` は 32 文字以上が必須)。
- 非 root ユーザー (`node`) で実行される。
- **マイグレーションはコンテナ起動時には実行されない。** デプロイパイプライン側で `npx prisma migrate deploy` を実行すること。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `Can't reach database server` | `docker compose ps` で PostgreSQL の起動を確認。`docker compose up -d` で起動。 |
| `環境変数の読み込みに失敗しました` | `.env` の `DATABASE_URL` / `JWT_SECRET` を確認。`NODE_ENV=production` の場合は `JWT_SECRET` が 32 文字以上か確認。 |
| Node のバージョンエラー | `nvm use` で Node 18 以上に切り替え。 |
| API が 401 を返す | `Authorization: Bearer <token>` ヘッダーを確認。アクセストークンは 15 分で切れるので `/auth/refresh` で再発行する。 |
| `/auth/refresh` が 401 を返す | 別端末での再ログインで上書きされた (後勝ち)、使用済みのリフレッシュトークンを再利用した、または 30 日の期限切れ。再ログインが必要。 |
| `npm test` で DB 接続エラー | `docker compose up -d` で Postgres を起動してから実行 (または `make test`)。 |
```
