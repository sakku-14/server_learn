# バックエンドプロジェクト 設計ドキュメント

## 概要
スマホアプリ（iOS）向けのバックエンドAPIを構築する。
実装する機能は以下の4つ。

- ログイン
- ログアウト
- プロフィール確認
- 退会

---

## 技術スタック

| 項目 | 決定事項 |
|---|---|
| 言語 | TypeScript |
| フレームワーク | Hono |
| 実行環境 | Node.js（ローカル実行） |
| DB | PostgreSQL |
| ORM | Prisma |
| バリデーション | Zod |
| 認証方式 | JWT |
| テスト | Vitest |
| ロガー | pino |

---

## アーキテクチャ

### 採用：レイヤードアーキテクチャ

責務を層ごとに分離する構成。初心者にも理解しやすく、今回の規模に最適。

```
Router → Controller → Service → Repository → DB
```

| 層 | 責務 |
|---|---|
| Router | エンドポイントの定義 |
| Controller | リクエスト受け取り・レスポンス返却 |
| Service | ビジネスロジック |
| Repository | DB操作 |
| Middleware | JWT検証・共通処理 |

### フォルダ構成

```
src/
  ├── routes/        # エンドポイントの定義
  ├── controllers/   # リクエスト・レスポンス処理
  ├── services/      # ビジネスロジック
  ├── repositories/  # DB操作
  ├── middlewares/   # JWT検証など
  └── index.ts       # エントリーポイント
tests/
  └── services/      # Service層のユニットテスト
logs/                # ログファイル（Git管理外）
```

---

## サーバー設定

- **ポート番号**: 3000
- **CORS**: Honoの公式CORSミドルウェアを使用。全オリジンを許可する（開発用途のため）

---

## APIバージョニング

- ヘッダーにバージョンを含める方式を採用する
- クライアントは全リクエストに `Api-Version: 1` ヘッダーを付与する
- サーバー側はヘッダーを読み取り、対応するバージョンの処理にルーティングする

```
POST /auth/login
Api-Version: 1
```

---

## DBスキーマ（想定）

```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL,
  name          TEXT NOT NULL,
  current_token TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);
```

---

## APIエンドポイント（想定）

| メソッド | パス | 認証 | 概要 |
|---|---|---|---|
| GET | /health | 不要 | ヘルスチェック |
| POST | /auth/login | 不要 | ログイン・JWT発行 |
| POST | /auth/logout | 必要 | ログアウト・トークン無効化 |
| GET | /users/me | 必要 | プロフィール取得 |
| DELETE | /users/me | 必要 | 退会・ユーザー削除 |

---

## 認証設計

### JWTの運用
- ログイン成功時にJWTを発行し、クライアント（スマホアプリ）が保持する
- 各APIリクエスト時にAuthorizationヘッダーでトークンを送信する
- サーバー側はDBの `current_token` と照合して検証する
- JWTの有効期限は無期限

### 複数端末ログイン：後勝ち方式
- `users` テーブルに `current_token` カラムを持つ
- ログインのたびに新しいJWTを発行し `current_token` を上書きする
- 古い端末からのリクエストはトークン不一致で弾く

### ログアウト
- クライアント側がトークンを破棄する
- サーバー側では `current_token` を null にする

### パスワード
- 現時点では平文で保存（後でハッシュ化対応予定）

### 認証フロー（スマホアプリ想定）

```
初回ログイン
  → サーバーがJWTを発行
  → アプリがトークンをスマホのストレージ（Keychainなど）に保存
  → DBのcurrent_tokenを更新

アプリ停止 → 再起動（自動ログイン）
  → ストレージから保存済みトークンを読み込む
  → そのトークンでAPIを叩く
  → トークンの再発行は発生しない

ログアウト
  → クライアントがトークンを破棄
  → サーバーのcurrent_tokenをnullにする
```

---

## レスポンス設計

### 成功時のレスポンス形式
データをそのまま返す（ラッパーなし）。

```json
{
  "id": 1,
  "name": "Yuki",
  "email": "yuki@example.com"
}
```

### エラーレスポンス形式
すべてのエラーレスポンスは以下の形式に統一する。

```json
{
  "code": "VALIDATION_ERROR",
  "detail": {
    "email": "メールアドレスの形式が正しくありません",
    "password": "8文字以上で入力してください"
  }
}
```

### HTTPステータスコード

| ケース | コード |
|---|---|
| 成功（取得・更新） | 200 |
| 成功（削除） | 204 |
| バリデーションエラー | 400 |
| 認証エラー（トークンなし・無効） | 401 |
| リソースなし | 404 |
| サーバーエラー | 500 |

---

## リクエストID

- リクエスト受信時にユニークなID（UUID）を付与する
- 全ログにリクエストIDを含めて記録する
- レスポンスヘッダーにも `X-Request-Id` として返す
- 障害調査時にリクエストIDで検索すれば該当リクエストの全ログが追える

```
リクエスト受信 → requestId: "abc-123" を付与
  → ログ: { requestId: "abc-123", method: "POST", path: "/auth/login", ... }
  → レスポンスヘッダー: X-Request-Id: abc-123
```

---

## ヘルスチェック

サーバーの死活監視用エンドポイントを用意する。

```
GET /health → 200 { "status": "ok" }
```

---

## ログ設計

### ライブラリ
- **pino** を使用
- 開発時は `pino-pretty` でコンソールに見やすく出力
- 本番時はJSON形式で出力（将来的に外部基盤へ流す想定）

### ログレベルの使い分け

| レベル | 用途 |
|---|---|
| ERROR | 即対応が必要なエラー（DB接続失敗など） |
| WARN | 問題になりうる事象（認証失敗の連続など） |
| INFO | 通常の操作ログ（ログイン成功・リクエスト受信） |
| DEBUG | 開発時の詳細情報（本番では出力しない） |

### 記録する内容・しない内容

```
✅ 記録する
  - リクエスト（メソッド・パス・ステータスコード・レスポンスタイム）
  - エラー（スタックトレース付き）
  - 認証イベント（ログイン成功・失敗・ログアウト）
  - DB操作エラー

❌ 記録しない（セキュリティ上）
  - パスワード
  - JWTトークンの中身
  - メールアドレスなどの個人情報
```

### 永続化

- ファイルに書き出して永続化する
- ファイル名は日付プレフィックスをつけて日次で分割する
- `pino` + `pino/file` でファイル出力
- アプリ起動時に当日の日付でファイル名を決定する
- 日付が変わったら次のリクエスト時に新しいファイルへ切り替える
- `logs/` ディレクトリは `.gitignore` に追加する
- アプリ起動時に30日以上前のログファイルを自動削除する

```
logs/
  ├── 20260623.log
  ├── 20260624.log
  └── 20260625.log
```

---

## テスト方針

### ライブラリ
- **Vitest** を使用

### テスト対象
- **Service層のユニットテストのみ**実施する
- Controller・Repositoryは今回スキップ

### テストファイルの配置
テストファイルは `tests/` フォルダにまとめる。

```
src/services/authService.ts
tests/services/authService.test.ts
```

### モック
- RepositoryはVitestのモック機能（`vi.mock`）で差し替える
- 実際のDBには接続しない

---

## DB運用

### マイグレーション
- スキーマ変更はPrismaの `migrate` コマンドで行う
- 手順は `README.md` に記載する

### シードデータ
- Prismaのシード機能を使って開発用ダミーデータを投入する
- 以下のユーザーを初期データとして用意する

```
id: 1, name: "テストユーザー1", email: "test1@example.com"
id: 2, name: "テストユーザー2", email: "test2@example.com"
id: 3, name: "テストユーザー3", email: "test3@example.com"
```

---

## 実装ルール

### 命名規則

| 対象 | ルール | 例 |
|---|---|---|
| ファイル名 | camelCase | `authService.ts` |
| 変数・関数 | camelCase | `getCurrentUser` |
| 型・クラス | PascalCase | `UserRepository` |
| 定数 | UPPER_SNAKE_CASE | `JWT_SECRET` |

### 環境変数
- `.env` ファイルで管理する
- `.env` は `.gitignore` に追加してGit管理から除外する
- `.env.example`（値を空にしたもの）をGit管理して必要な変数を明示する

```bash
# .env.example
DATABASE_URL=
JWT_SECRET=
PORT=
```

### エラーハンドリング
- `try/catch` を各所に書かず、共通のエラーハンドラーミドルウェアで一元管理する
- エラーはすべてミドルウェアに集約し、統一されたエラーレスポンス形式で返す

---

## 環境構築

### 採用ツール一覧

| ツール | 用途 |
|---|---|
| Node.js | 実行環境 |
| Docker | PostgreSQLをコンテナで動かす |
| Prisma Studio | DB確認用GUIツール（Prisma組み込み） |
| REST Client（VSCode拡張） | APIテスト |
| Postman | APIテスト（GUIツール） |
| Prisma（VSCode拡張） | スキーマファイルのシンタックスハイライト |
| ESLint | コード品質チェック |
| Prettier | コード整形 |

### README.md について
- 環境構築手順・マイグレーション手順はすべて `README.md` に記載する
- 内容の詳細はプロジェクト初期化後に Claude Code に作成させる

---

## Claude Codeへの指示例

このドキュメントをプロジェクトルートに置いた上で、以下のように指示してください。

```
project-context.md を読んで、設計に従ってセットアップから実装まで進めてください。
まずはプロジェクトの初期化から始めてください。
環境構築手順・マイグレーション手順はすべて README.md にまとめてください。
```
