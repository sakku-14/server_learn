# バックエンド構築ガイド(ゼロから同じものを作るための完全手順)

このドキュメントは、今回作成したバックエンド API を **バックエンド開発が初めての人でも、ゼロから同じものを再現できる** ように書いたものです。
単なるコマンドの羅列ではなく、**「なぜその作業をするのか」** を各ステップに添えています。

- 設計の元になった仕様書: [`../project-context.md`](../project-context.md)
- 実際の使い方(環境構築・起動・マイグレーション): [`../README.md`](../README.md)
- 今後の機能追加の進め方(機能を 1 つ足すときの手順): [`./DEVELOPMENT_WORKFLOW.md`](./DEVELOPMENT_WORKFLOW.md)
- このドキュメント: **作る側の視点での解説と再現手順**

---

## 目次

1. [完成するもの(全体像)](#1-完成するもの全体像)
2. [先に用語を知る(技術スタック解説)](#2-先に用語を知る技術スタック解説)
3. [なぜこの構成にするのか(アーキテクチャの考え方)](#3-なぜこの構成にするのかアーキテクチャの考え方)
4. [事前準備(PC に入れておくもの)](#4-事前準備pc-に入れておくもの)
5. [構築手順ステップ・バイ・ステップ](#5-構築手順ステップバイステップ)
6. [ソースコードの中身を層ごとに理解する](#6-ソースコードの中身を層ごとに理解する)
7. [動作確認のしかた](#7-動作確認のしかた)
8. [実際にハマったポイントと対処(重要)](#8-実際にハマったポイントと対処重要)
9. [用語集](#9-用語集)

---

## 1. 完成するもの(全体像)

スマホアプリ(iOS)向けの **バックエンド API** を作ります。

> **バックエンド API とは?**
> スマホアプリ(フロントエンド)は画面表示を担当します。一方「ユーザー情報をデータベースに保存する」「ログインの正しさを判定する」といった処理は、ネット越しのサーバー上で行います。このサーバー側のプログラムが **バックエンド** で、アプリと決まった形式(API)でデータをやり取りします。

提供する機能は 4 つ。

| 機能 | エンドポイント | 認証 |
|---|---|---|
| ログイン | `POST /auth/login` | 不要 |
| ログアウト | `POST /auth/logout` | 必要 |
| プロフィール確認 | `GET /users/me` | 必要 |
| 退会 | `DELETE /users/me` | 必要 |

> **エンドポイントとは?**
> API における「窓口の住所」です。`POST /auth/login` なら「`/auth/login` という住所に、POST という方法でデータを送るとログイン処理が走る」という意味。`POST` `GET` `DELETE` は HTTP メソッドと呼ばれ、それぞれ「送信/作成」「取得」「削除」を表す慣習です。

加えて、ヘルスチェック用の `GET /health`(サーバーが生きているか確認する窓口)も用意します。

---

## 2. 先に用語を知る(技術スタック解説)

「何を使うか」を、それぞれ **何をしてくれる道具なのか** から説明します。

| 道具 | 種類 | 何をするものか |
|---|---|---|
| **TypeScript** | プログラミング言語 | JavaScript に「型」を足した言語。`number`(数値)を入れるべき所に文字を入れる、といったミスを **実行前に** 発見できる。バグが減る。 |
| **Node.js** | 実行環境 | JavaScript/TypeScript を PC やサーバー上で動かすためのエンジン。「これがないと書いたコードを動かせない」土台。 |
| **Hono** | Web フレームワーク | 「`/auth/login` に来たリクエストをこの関数で処理する」という **窓口とその処理の対応付け** を簡単に書くための道具。素の Node.js でも書けるが、面倒な部分を肩代わりしてくれる。軽量で高速。 |
| **PostgreSQL** | データベース(DB) | ユーザー情報などを **保存しておく場所**。表(テーブル)の形でデータを永続的に保管する。「ポスグレ」と略される。 |
| **Docker** | コンテナ実行ツール | PostgreSQL のようなソフトを **自分の PC に直接インストールせず**、隔離された箱(コンテナ)の中で動かす道具。「PC を汚さない」「チーム全員が同じ環境を再現できる」のが利点。 |
| **Prisma** | ORM | TypeScript のコードから DB を操作するための道具。本来は SQL という DB 専用言語を書く必要があるが、Prisma を使うと `prisma.user.findUnique(...)` のように **普通の TypeScript で DB を読み書き** できる。 |
| **Zod** | バリデーションライブラリ | 外部から来たデータが「正しい形か」を検査する道具。例:「email はメール形式か」「password は 8 文字以上か」。不正なデータが奥の処理に流れ込むのを防ぐ。 |
| **JWT** | 認証方式 | JSON Web Token。ログイン成功時にサーバーが発行する **電子的な会員証**。以降のリクエストにこれを添えることで「ログイン済みの本人」だと証明する。 |
| **Vitest** | テストフレームワーク | 書いたコードが意図通り動くかを **自動でチェックするプログラム(テスト)** を書くための道具。 |
| **pino** | ロガー | プログラムの動作記録(ログ)をファイルに残す道具。障害が起きたとき「何が起きたか」を後から追える。 |
| **OpenAPI** | API 仕様の記述形式 | 「どの窓口に何を送ると何が返るか」を機械が読める形で書くための **世界標準フォーマット**。これがあると仕様書UIやクライアントコードを自動生成できる。旧称 Swagger。 |
| **@hono/zod-openapi** | ライブラリ | Hono + Zod から **OpenAPI 仕様を自動生成** する道具。バリデーション用に書いた Zod スキーマをそのまま仕様の元にできる。 |
| **Scalar** | API ドキュメント UI | OpenAPI 仕様を **見やすい仕様書ページ** として表示する道具。ブラウザで開いて API を一覧・試せる。 |

> **ORM とは?(Object-Relational Mapping)**
> DB の「表(テーブル/行)」と、プログラムの「オブジェクト(データのまとまり)」を **自動的に変換** してくれる仕組み。これにより SQL を直接書かずに DB を操作できる。Prisma はその代表例。

---

## 3. なぜこの構成にするのか(アーキテクチャの考え方)

### レイヤード(層状)アーキテクチャを採用

処理を **役割ごとの層に分ける** 設計です。リクエストは次の順に流れます。

```
リクエスト
  → Router(どの窓口か振り分け)
  → Controller(リクエストを受け取り、レスポンスを返す)
  → Service(ビジネスロジック=本質的な処理・判断)
  → Repository(DB の読み書き)
  → DB(PostgreSQL)
```

| 層 | 役割 | たとえるなら |
|---|---|---|
| Router | URL と処理の対応付け | 受付の案内板 |
| Controller | 入出力の交通整理 | 受付係 |
| Service | 判断・計算などの本質的処理 | 実務担当者 |
| Repository | DB とのやり取りだけを担当 | 倉庫番 |

**なぜ層に分けるのか?**

- **変更に強い:** 例えば DB を別のものに変えても、修正は Repository 層だけで済む。Service 層(本質的な処理)はそのまま使える。
- **テストしやすい:** Service だけを取り出して、DB なしでテストできる(後述)。
- **読みやすい:** 「ログインの判断ロジックを見たい」なら Service を見ればよい、と探す場所が明確になる。

各層を **1 つのファイル/フォルダに分けて** 配置します(`src/controllers/`、`src/services/` …)。

---

## 4. 事前準備(PC に入れておくもの)

| 必要なもの | 確認コマンド | 補足 |
|---|---|---|
| Node.js **18 以上**(推奨 22) | `node -v` | 古いと Hono/Prisma が動かない。下記「nvm」で切り替える。 |
| Docker | `docker --version` | PostgreSQL を動かすのに使う。Docker Desktop を起動しておく。 |

> **nvm とは?(Node Version Manager)**
> PC に **複数バージョンの Node.js を共存させ、切り替える** 道具。今回 PC のデフォルトは古い Node 16 だったため、`nvm use 22` で 22 に切り替えて作業した。プロジェクト直下に `.nvmrc`(中身は `22`)を置いておくと、`nvm use` だけで正しいバージョンに合う。

---

## 5. 構築手順ステップ・バイ・ステップ

> 以降、コマンドはプロジェクトのルートディレクトリ(`server/`)で実行します。

### Step 1. プロジェクトの初期化

**目的:** Node.js プロジェクトの土台(`package.json`)とフォルダ構造を作る。

```bash
mkdir server && cd server
nvm use 22                    # Node を 22 に
```

`package.json` を作成する。これは **このプロジェクトの設定書** で、「使うライブラリ一覧」「実行コマンドの短縮名(scripts)」を書く中心ファイル。

> **package.json の `scripts` とは?**
> よく使う長いコマンドに短い名前を付けたもの。例えば `"dev": "tsx watch src/index.ts"` と書いておくと、`npm run dev` だけでサーバーを起動できる。

主な scripts(今回設定したもの):

| コマンド | 何をするか |
|---|---|
| `npm run dev` | 開発サーバー起動(コード保存で自動再起動) |
| `npm run build` | TypeScript を実行用の JavaScript に変換 |
| `npm start` | 変換後のコードで起動(本番相当) |
| `npm test` | 自動テストを実行 |
| `npm run prisma:migrate` | DB にテーブルを作る/変更する |
| `npm run db:seed` | テスト用データを DB に入れる |

### Step 2. フォルダ構成を作る

**目的:** レイヤードアーキテクチャの層ごとに置き場所を用意する。

```bash
mkdir -p src/{routes,controllers,services,repositories,middlewares,lib,config} tests/services prisma
echo "22" > .nvmrc
```

```
src/
  routes/        # エンドポイント定義(窓口の一覧)
  controllers/   # リクエスト受け取り・レスポンス返却
  services/      # ビジネスロジック(判断・本質処理)
  repositories/  # DB 操作
  middlewares/   # 共通の前処理(認証・ログなど)
  lib/           # 部品(ロガー、DB接続、JWT、エラー定義など)
  config/        # 設定(環境変数の読み込み・検証)
  index.ts       # エントリーポイント(プログラムの開始地点)
prisma/          # DB スキーマとシードデータ
tests/services/  # Service 層のテスト
```

### Step 3. ライブラリのインストール

**目的:** 使う道具(Hono, Prisma など)をダウンロードして使えるようにする。

```bash
npm install            # package.json に書いた依存をすべて取得
```

ダウンロードされたものは `node_modules/` フォルダに入る(巨大なので Git 管理しない)。

### Step 4. 環境変数の設定

**目的:** パスワードや接続情報など、**コードに直接書きたくない秘密情報** を外部ファイルで管理する。

> **環境変数とは?**
> プログラムの外側から与える設定値。DB 接続先や秘密鍵など、人や環境によって変わる/秘密にすべき値をコードに直書きせず、`.env` というファイルにまとめる。`.env` は **Git にコミットしない**(秘密が漏れるため)。代わりに、値を空にした見本 `.env.example` だけを共有して「何の変数が必要か」を伝える。

`.env`(実際の値。Git 管理外):

```bash
DATABASE_URL="postgresql://app:app@localhost:5432/app?schema=public"
JWT_SECRET="dev-local-secret-change-me"
PORT=3000
```

`.env.example`(見本。Git 管理する):

```bash
DATABASE_URL=
JWT_SECRET=
PORT=
```

| 変数 | 意味 |
|---|---|
| `DATABASE_URL` | DB への接続情報(場所・ユーザー・パスワード・DB 名) |
| `JWT_SECRET` | JWT に署名する秘密鍵。これを知らない第三者は正規のトークンを偽造できない |
| `PORT` | サーバーが待ち受けるポート番号(3000) |

`.gitignore` に `.env` / `node_modules/` / `logs/` / `dist/` を追加し、これらを **Git 管理から除外** する。
(秘密情報・自動生成物・巨大ファイルはバージョン管理しないのが鉄則。)

### Step 5. PostgreSQL を Docker で起動

**目的:** データの保存先(DB)を用意する。PC に直接インストールせず、Docker の箱の中で動かす。

`docker-compose.yml` を作成する。これは「どんなコンテナをどう起動するか」を書いた設計図。

> **docker compose とは?**
> 複数のコンテナ設定を 1 つのファイル(`docker-compose.yml`)にまとめ、`docker compose up` 一発で起動できるようにする仕組み。今回は PostgreSQL 1 つだけだが、設定を再現可能な形で残せる利点がある。

```bash
docker compose up -d     # -d はバックグラウンド起動の意味
```

これで `localhost:5432`(PostgreSQL の標準ポート)で DB が待ち受ける。

### Step 6. DB スキーマを定義する(Prisma)

**目的:** DB にどんな表(テーブル)を作るかを定義する。

> **スキーマとは?**
> DB の「設計図」。どんな名前の表があり、各列(カラム)がどんな型かを定める。

`prisma/schema.prisma`:

```prisma
model User {
  id           Int      @id @default(autoincrement())  // 連番の主キー
  email        String   @unique                        // 重複不可
  password     String
  name         String
  currentToken String?  @map("current_token")          // ? は「空でも可」
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("users")   // 実際の DB 上のテーブル名は users
}
```

> `currentToken` は **今有効なログイントークン** を保存する列。後述の「後勝ちログイン」で使う。

### Step 7. マイグレーション(テーブルを実際に作る)

**目的:** スキーマ(設計図)を元に、DB に実際のテーブルを作る。

> **マイグレーションとは?**
> スキーマの変更を DB に反映する作業、およびその履歴。「テーブルを追加した」「列を増やした」といった変更を SQL ファイルとして記録し、誰の環境でも同じ手順で DB を再現できるようにする。

```bash
npx prisma migrate dev --name init
```

これにより `prisma/migrations/` 配下に変更履歴(SQL)が生成され、DB にテーブルが作られる。同時に Prisma Client(TypeScript から DB を操作するためのコード)も自動生成される。

### Step 8. シードデータの投入

**目的:** 開発・動作確認用のダミーユーザーを DB に入れておく。

> **シード(seed)とは?**
> 「種」の意味。開発初期に入れておく **初期データ**。毎回手で登録する手間を省く。

`prisma/seed.ts` にテストユーザー 3 名を定義し、投入する。

```bash
npm run db:seed
```

| id | name | email | password |
|---|---|---|---|
| 1 | テストユーザー1 | test1@example.com | password123 |
| 2 | テストユーザー2 | test2@example.com | password123 |
| 3 | テストユーザー3 | test3@example.com | password123 |

> パスワードは設計上、現時点は **平文**(暗号化なし)で保存している(後でハッシュ化する想定)。本番では必ずハッシュ化が必要。

### Step 9. アプリ本体のコードを書く

ここからが実装の中心。詳細は次章で層ごとに解説する。

### Step 10. 起動して確認

```bash
npm run dev
curl http://localhost:3000/health    # {"status":"ok"} が返れば成功
```

---

## 6. ソースコードの中身を層ごとに理解する

リクエストが流れる順に、各ファイルの役割を説明します。

### (前処理)ミドルウェア `src/middlewares/`

> **ミドルウェアとは?**
> リクエストが本来の処理に届く前(または後)に、**共通でやりたいこと** を挟み込む仕組み。「全リクエストにログを残す」「認証チェックする」など、各窓口で重複する処理をまとめられる。

今回のミドルウェア:

| ファイル | 役割 | なぜ必要か |
|---|---|---|
| `requestContext.ts` | リクエストごとに一意な ID(UUID)を発行し、ログに付与。レスポンスに `X-Request-Id` を返す。受信〜完了をログ記録 | 障害調査時、1 つのリクエストに紐づく全ログをこの ID で追える |
| `apiVersion.ts` | `Api-Version: 1` ヘッダーの有無・値を検査 | API を将来バージョンアップしても、古いアプリを壊さず共存させるため |
| `auth.ts` | JWT を検証し、ログイン済み本人か確認 | 認証が必要な窓口を保護する |
| `errorHandler.ts` | 全エラーを 1 か所で受け止め、統一形式で返す | 各所に `try/catch` を散らさず、エラー処理を一元化するため |

> **UUID とは?** 重複しない長いランダム文字列(例: `d7a27be5-...`)。リクエストの識別子に使う。
> **ヘッダーとは?** リクエスト/レスポンスに添える付帯情報。本文(body)とは別に「誰が」「どの形式で」などを伝える。

### Router 層 `src/routes/`

**役割:** 「どの URL+メソッドが、どの処理を呼ぶか」を対応付ける。

```ts
authRoutes.post('/login', authController.login);          // 認証不要
authRoutes.post('/logout', auth, authController.logout);  // auth ミドルウェアを通す=認証必要
```

`auth` を間に挟むかどうかで「認証が必要な窓口」を表現している点がポイント。

### Controller 層 `src/controllers/`

**役割:** リクエストから必要な値を取り出し、Service を呼び、結果をレスポンスとして返す **交通整理**。判断ロジックは持たない。

```ts
async login(c) {
  const body = await c.req.json();          // リクエスト本文を取り出す
  const result = await authService.login(body);  // 判断は Service に任せる
  return c.json({ token: result.token, ...result.user }, 200);  // 結果を返す
}
```

### Service 層 `src/services/`

**役割:** **ビジネスロジック**(=このアプリ固有の判断・処理)の中心。今回最も重要な層。

> **ビジネスロジックとは?**
> 「正しいパスワードか確認する」「ログイン成功時にトークンを発行して保存する」といった、**アプリの本質的なルール**。入出力(Controller)や DB アクセス(Repository)とは切り離して、ここに集約する。

例(ログイン処理の流れ):

1. 入力を Zod で検証(email 形式・password 8 文字以上)→ 不正なら 400 エラー
2. email でユーザーを検索(Repository に依頼)
3. パスワード照合 → 不一致なら 401 エラー
4. JWT を新規発行
5. その JWT を `current_token` に保存(=後勝ちログイン。後述)
6. トークンとユーザー情報を返す

### Repository 層 `src/repositories/`

**役割:** DB の読み書き **だけ** を担当。Prisma を使う。

```ts
findByEmail(email) { return prisma.user.findUnique({ where: { email } }); }
updateCurrentToken(id, token) { return prisma.user.update({ where: { id }, data: { currentToken: token } }); }
```

DB 操作をここに閉じ込めることで、「DB を変えたい」「クエリを直したい」時の修正範囲がこの層だけで済む。

### 部品 `src/lib/`

| ファイル | 役割 |
|---|---|
| `prisma.ts` | DB 接続(Prisma Client)を 1 個だけ作って使い回す |
| `jwt.ts` | JWT の発行・検証。今回 **有効期限なし(無期限)** で発行 |
| `errors.ts` | エラーの種類(`VALIDATION_ERROR` `UNAUTHORIZED` 等)を定義 |
| `validation.ts` | Zod の検査失敗を、統一エラー形式に変換する補助 |
| `logger.ts` | pino ロガー。**日付ごとにログファイルを分け**、30 日より古いログは自動削除 |

### 設定 `src/config/env.ts`

**役割:** 起動時に環境変数を読み込み、**足りない/不正なら即座にエラーで停止** する。

> なぜ検証するのか? `JWT_SECRET` が未設定のまま起動してしまうと、認証が壊れた状態で動き続け、原因に気づきにくい。**起動時点で落とす** ことで早期に問題を発見できる(フェイルファストという考え方)。

### エントリーポイント `src/index.ts`

**役割:** すべてを組み立てて起動する開始地点。

```ts
app.use('*', cors());            // 全リクエストに CORS 許可(開発用に全オリジン許可)
app.use('*', requestContext);    // 全リクエストにログ・リクエストID
app.get('/health', ...);         // ヘルスチェック
app.route('/auth', authRoutes);  // /auth/* を authRoutes に委譲
app.route('/users', userRoutes); // /users/* を userRoutes に委譲
app.onError(errorHandler);       // エラーは全部ここへ集約
serve({ fetch: app.fetch, port }); // 起動
```

> **CORS とは?(Cross-Origin Resource Sharing)**
> ブラウザのセキュリティ機構で、「別ドメインの API を勝手に叩けない」制限。今回は開発用途のため全許可にしている。本番では許可元を絞るのが望ましい。

---

### 認証の仕組み(後勝ちログイン)を理解する

設計上の重要ポイント。**同じアカウントで新しい端末からログインしたら、古い端末を自動でログアウトさせる** 方式です。

```
1. ログイン成功 → JWT を発行し、DB の current_token に保存
2. 以降のリクエストは「添えられた JWT」と「DB の current_token」を照合
3. 別端末で再ログイン → current_token が新しい JWT で上書きされる
   → 古い端末の JWT は current_token と一致しなくなり、弾かれる(401)
4. ログアウト → current_token を空(null)にする → そのトークンは無効化
```

> JWT 単体では「無効化」ができない(発行済みトークンは期限まで有効)。そこで **DB の current_token と必ず照合** することで、サーバー側からログアウト・端末切り替えを制御している。これが「後勝ち」を実現する肝。

---

### ログ設計を理解する

> **ログとは?** プログラムが「いつ・何をしたか」を記録した文章。障害時の調査や、不正アクセスの検知に使う。

今回の方針:

- **pino** で出力。開発時は読みやすく整形、本番は機械処理しやすい JSON 形式。
- ファイルは `logs/YYYYMMDD.log` の形で **1 日ごとに分割**(例: `20260624.log`)。日付が変われば自動で新しいファイルに切り替わる。
- すべてのログに **リクエスト ID** を付け、1 リクエストの足跡を追えるようにする。
- 起動時に **30 日より古いログを自動削除**(ディスクが溢れないように)。
- **記録しないもの:** パスワード、JWT の中身、メールアドレス等の個人情報(漏洩リスクを避けるため)。

---

### テストを理解する

> **テスト(自動テスト)とは?** 「この入力なら、この結果になるはず」をコードで書いておき、機械に繰り返し検証させる仕組み。修正で別の場所を壊していないか即座に分かる。

今回は **Service 層だけ** をテスト対象にした(最も重要なロジックが集まる層のため)。

ポイントは **モック**。

> **モック(mock)とは?** 本物の代わりに使う「偽物」。テストで Repository(DB アクセス)を偽物に差し替えることで、**実際の DB に接続せず**、純粋にロジックだけを高速に検証できる。今回は Vitest の `vi.mock` を使った。

```bash
npm test    # → 10 件のテストが通る
```

---

### API 仕様書の自動生成(OpenAPI / Scalar)を理解する

> **API 仕様書とは?**
> 「どの窓口(エンドポイント)に、どんなデータを送ると、何が返ってくるか」をまとめた **説明書**。スマホアプリ(フロント)担当者はこれを見て通信処理を書く。仕様書がないと毎回チャットで「このAPIの戻り値の形は?」と確認することになり、認識ズレやバグの原因になる。

#### 何を選んだか

| 採用したもの | 役割 |
|---|---|
| **OpenAPI 3.1** | 仕様書の **フォーマット**(書式の世界標準) |
| **コードファースト**(スキーマ駆動) | 仕様書の **作り方**。コードから仕様を自動生成する方式 |
| **`@hono/zod-openapi`** | Zod スキーマから OpenAPI を生成するライブラリ |
| **Scalar** | 生成した仕様を **見やすい Web ページ** で表示する UI |

> **OpenAPI / Swagger とは?**
> API の仕様を **機械が読める統一フォーマット** で書く取り決め。「`/auth/login` は POST で email と password を受け取り、200 で token を返す」といった情報を JSON/YAML で表現する。昔は **Swagger** という名前で、今は **OpenAPI** が正式名称(中身はほぼ同じ)。REST API の仕様書の事実上の世界標準。

#### なぜこの構成にしたのか(選定理由)

**1. フォーマットは OpenAPI 一択**
REST API の仕様記述としては OpenAPI が事実上の標準で、ツール・ライブラリ・ドキュメント UI のエコシステムが圧倒的に充実しているため。独自形式や手書きの README 表だけだと、ツールの恩恵(UIの自動表示・クライアント生成・型チェック)を一切受けられない。

**2. 作り方は「コードファースト」を選んだ**
API 仕様書の作り方には大きく 2 通りある。

| 方式 | やり方 | 長所 | 短所 |
|---|---|---|---|
| デザインファースト | 先に仕様書(YAML)を手で書き、それに合わせて実装する | 実装前にチーム間で仕様を合意できる | **仕様書と実装が二重管理**になり、片方を直し忘れてズレる |
| **コードファースト**(採用) | コードを書くと、そこから仕様書が自動生成される | **仕様と実装が必ず一致**する/書く手間が一度で済む | 実装前のレビューには向きにくい |

> **スキーマ駆動 / 単一の信頼できる情報源(SSOT)とは?**
> SSOT = Single Source of Truth。「同じ情報を 2 か所に書かない。正となる場所を 1 つに決める」という設計原則。今回は **Zod スキーマ** を唯一の正とし、そこから「入力チェック」も「API 仕様書」も生成する。両方を別々に手書きしないので、ズレようがない。

**決め手:** このプロジェクトは入力検証に **すでに Zod を使っている**(`loginSchema` など)。コードファーストなら、その Zod スキーマをそのまま仕様書の元に再利用できる。**仕様書を別途書く作業がまるごと不要**になり、かつ実装とズレない。少人数開発では二重管理の事故を防げるこの方式が最も効率的だと判断した。

**3. 表示 UI は Scalar を選んだ**
同種の UI に老舗の Swagger UI もあるが、Scalar はモダンで見やすく、Hono との公式統合があり導入が一行で済むため採用した。

#### どうやって導入したか

**手順 1: ライブラリを入れる**

```bash
npm i @hono/zod-openapi@0.19.10 @scalar/hono-api-reference
```

> ⚠️ 最新の `@hono/zod-openapi`(1.x)は Zod の **バージョン 4** を必須とするが、本プロジェクトは Zod 3 系。そのため Zod 3 に対応する **0.19.10** を指定して入れた(詳細は「ハマったポイント」参照)。

**手順 2: 共通の土台を作る**(`src/lib/openapi.ts`)
仕様生成用の Hono インスタンスを作るファクトリと、共通スキーマ(エラー形式など)を置いた。重要なのは **`defaultHook`**:

> **defaultHook とは?** `@hono/zod-openapi` が入力チェックに失敗したとき自動で呼ぶ処理。ここで既存のエラー形式 `{ code, detail }` に変換し直すことで、**仕様書を導入してもエラーレスポンスの形が変わらない** ようにした。

```ts
export function createOpenAPIApp() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        // 既存の service 層と同じ VALIDATION_ERROR に揃える
        throw validationError(zodIssuesToDetail(result.error.issues));
      }
    },
  });
}
```

**手順 3: 各エンドポイントを `createRoute` で定義する**(`src/routes/*.ts`)
「メソッド・パス・リクエスト・レスポンス」を 1 か所にまとめて宣言する。ログイン入力は **既存の `loginSchema` を再利用**(= SSOT)。

```ts
const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  request: { body: { content: { 'application/json': { schema: LoginRequest } } } },
  responses: {
    200: { description: 'ログイン成功', content: { 'application/json': { schema: LoginResponse } } },
    400: errorResponse('バリデーションエラー'),
    401: errorResponse('認証失敗'),
  },
});
authRoutes.openapi(loginRoute, (c) => authController.login(c)); // 既存の Controller をそのまま接続
```

**手順 4: 仕様書を公開する**(`src/index.ts`)
ルートの土台を `OpenAPIHono` にし、認証方式(Bearer)を登録、仕様 JSON とドキュメント UI を公開する。

```ts
app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
});
app.doc('/doc', { openapi: '3.1.0', info: { title: 'App Backend API', version: '1.0.0' } });
app.get('/reference', Scalar({ url: '/doc' })); // 見やすい仕様書ページ
```

#### どうやって使うか

サーバーを起動(`npm run dev`)した状態で、ブラウザ/curl から:

| URL | 用途 |
|---|---|
| http://localhost:3000/reference | **API 仕様書(Scalar UI)**。ブラウザで開いて全エンドポイントを閲覧する |
| http://localhost:3000/doc | OpenAPI 3.1 の JSON。Postman 取り込みやクライアント自動生成に使う |

```bash
curl http://localhost:3000/doc      # 仕様(JSON)が返る
# ブラウザで http://localhost:3000/reference を開くと仕様書ページが見える
```

**今後エンドポイントを追加するときの流れ:**
`createRoute` で定義 → ハンドラを `.openapi()` で接続するだけ。**仕様書は自動更新される**ので、ドキュメントを別途書き直す必要はない。

---

## 7. 動作確認のしかた

サーバー起動後、別ターミナルから `curl`(コマンドで HTTP リクエストを送る道具)で確認する。

```bash
# ログイン → token を取得
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "Api-Version: 1" \
  -d '{"email":"test1@example.com","password":"password123"}'

# プロフィール取得(上で得た token を使う)
curl http://localhost:3000/users/me \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <token>"
```

期待する挙動(今回すべて確認済み):

| 操作 | 期待結果 |
|---|---|
| `Api-Version` ヘッダーなし | 400 |
| email/password が不正 | 400(項目ごとのエラーメッセージ) |
| 正しい認証情報でログイン | 200 + token |
| token なしで `/users/me` | 401 |
| 別端末で再ログイン後、旧 token を使用 | 401(後勝ち) |
| ログアウト後に同じ token | 401 |
| 退会(`DELETE /users/me`) | 204、その後の同アカウント操作は不可 |

---

## 8. 実際にハマったポイントと対処(重要)

今回の構築で実際に遭遇した問題と解決策。**同じ作業をすると高確率で踏む** ため記録します。

### (1) Node.js のバージョンが古くて動かない

- **症状:** PC のデフォルトが Node 16 で、Hono / Prisma の最新版が動かない。
- **原因:** これらのライブラリは Node 18 以上を要求する。
- **対処:** `nvm`(Node のバージョン切り替えツール)で Node 22 を使用。プロジェクトに `.nvmrc`(中身 `22`)を置き、`nvm use` でいつでも合わせられるようにした。

### (2) `.env` がアプリ側で読み込まれない

- **症状:** 起動時に `環境変数の読み込みに失敗しました: DATABASE_URL [Required]` と出て落ちる。
- **原因:** Prisma は `.env` を自動で読むが、**アプリ本体(Node.js)は `.env` を自動では読まない**。両者は別物。
- **対処:** `dotenv` というライブラリを追加し、設定読み込みの最初で `import 'dotenv/config'` して `.env` を読み込むようにした。

### (3) ビルド結果の出力先がずれる

- **症状:** `npm run build` 後、`npm start`(= `node dist/index.js`)が「ファイルが無い」で失敗。
- **原因:** TypeScript の設定で `rootDir` が `.`(プロジェクト全体)だったため、出力が `dist/src/index.js` になっていた。
- **対処:** ビルド専用設定 `tsconfig.build.json` を作り、`rootDir` を `src` に、対象を `src` のみに限定。結果 `dist/index.js` に正しく出力されるようにした(テスト用ファイルもビルド対象から除外)。

### (4) Hono の JWT 関数で型エラー

- **症状:** `sign(payload, secret)` で「引数が 3 つ必要」と型エラー。
- **原因:** 使っている Hono のバージョンでは、署名アルゴリズムの指定が必須だった。
- **対処:** `sign(payload, secret, 'HS256')` のように **アルゴリズムを明示**(`verify` も同様)。

### (5) Docker が起動していない

- **症状:** `docker compose up` で `Cannot connect to the Docker daemon`。
- **原因:** Docker Desktop アプリ自体が起動していなかった。
- **対処:** Docker Desktop を起動し、daemon(常駐プロセス)が立ち上がるのを待ってから再実行。`docker info` が成功すれば準備完了。

### (6) OpenAPI ライブラリのバージョンが合わない

- **症状:** `npm i @hono/zod-openapi` で `peer zod@"^4.0.0"` という依存エラーが出てインストールできない。
- **原因:** 最新の `@hono/zod-openapi`(1.x)は **Zod 4** を必須とするが、本プロジェクトの Zod は **3 系**。バージョンの世代が噛み合っていなかった。
- **対処:** Zod 3 に対応する旧版 **0.19.10** を明示して導入(`npm i @hono/zod-openapi@0.19.10`)。Zod 4 へ上げると既存のバリデーション記述全体に影響が出るため、影響範囲の小さい「ライブラリ側を合わせる」を選んだ。
  > **peer dependency(ピア依存)とは?** 「このライブラリを使うなら、別のライブラリのこのバージョンも一緒に入れてね」という要求。今回は zod-openapi が「Zod は 4 を使って」と要求していた。

---

## 9. 用語集

| 用語 | 意味 |
|---|---|
| **API** | プログラム同士がデータをやり取りする取り決め・窓口。アプリ⇄サーバー間の通信規約。 |
| **エンドポイント** | API の個々の窓口(URL+メソッドの組)。 |
| **HTTP メソッド** | リクエストの種類。GET=取得、POST=送信/作成、DELETE=削除 など。 |
| **ステータスコード** | 結果を表す番号。200=成功、204=成功(中身なし)、400=入力不正、401=認証エラー、404=なし、500=サーバー異常。 |
| **リクエスト / レスポンス** | クライアントからの要求 / サーバーからの応答。 |
| **ヘッダー** | リクエスト/レスポンスに添える付帯情報(認証トークン、データ形式、API バージョンなど)。 |
| **ボディ(body)** | リクエスト/レスポンスの本文データ(JSON など)。 |
| **JSON** | データを表す軽量なテキスト形式。`{"key": "value"}` の形。 |
| **フレームワーク** | アプリ開発の土台・骨組みを提供する道具(今回は Hono)。 |
| **ライブラリ** | 特定機能をまとめた部品(Zod, pino など)。 |
| **ミドルウェア** | リクエストの本処理の前後に挟む共通処理。 |
| **データベース(DB)** | データを永続的に保存する場所。 |
| **テーブル / カラム / 行** | 表 / 列 / 行。DB のデータ構造。 |
| **SQL** | DB を操作する専用言語。Prisma を使うと直接書かずに済む。 |
| **ORM** | DB とプログラムのオブジェクトを変換する仕組み(Prisma)。 |
| **マイグレーション** | スキーマ変更を DB に反映する作業とその履歴。 |
| **シード** | 開発用の初期データ。 |
| **環境変数** | コード外から与える設定値。秘密情報は `.env` に置く。 |
| **JWT** | ログイン後に持つ電子的な会員証(トークン)。 |
| **トークン** | 本人確認に使う符号。ここでは JWT を指す。 |
| **認証 / 認可** | 認証=本人確認、認可=権限の許可。 |
| **CORS** | ブラウザの異なるドメイン間アクセス制限の仕組み。 |
| **コンテナ / Docker** | ソフトを隔離した箱で動かす技術と、その代表ツール。 |
| **daemon(デーモン)** | 裏で常駐し続けるプロセス。Docker daemon が動いていないと docker コマンドは使えない。 |
| **ログ / ロガー** | 動作記録 / それを残す道具(pino)。 |
| **モック** | テスト用の偽物の部品。 |
| **ホットリロード** | コードを保存すると自動でサーバーが再起動する開発支援機能。 |
| **ビルド** | TypeScript を実行用の JavaScript に変換すること。 |
| **エントリーポイント** | プログラムの開始地点(`src/index.ts`)。 |
| **nvm** | Node.js のバージョンを切り替える道具。 |
| **npm** | Node のパッケージ(ライブラリ)管理ツール。`npm install` で取得。 |
| **OpenAPI / Swagger** | API 仕様を機械可読の統一形式で書く世界標準。旧称 Swagger、現 OpenAPI。 |
| **Scalar** | OpenAPI 仕様を見やすい仕様書 UI として表示するツール(`/reference`)。 |
| **コードファースト / スキーマ駆動** | コード(Zod スキーマ)から仕様書を自動生成する方式。実装と仕様がズレない。 |
| **デザインファースト** | 先に仕様書を手書きし、それに合わせて実装する方式(今回は不採用)。 |
| **SSOT(単一の信頼できる情報源)** | 同じ情報を 2 か所に書かず、正となる場所を 1 つに決める設計原則。 |
| **peer dependency** | 「このライブラリを使うなら、別ライブラリのこのバージョンも必要」という依存要求。 |

---

## 付録:ゼロから再現する最短手順(まとめ)

```bash
# 0. 準備: Docker Desktop を起動しておく
nvm use 22                              # Node 22 に切り替え

# 1. プロジェクト作成
mkdir server && cd server
mkdir -p src/{routes,controllers,services,repositories,middlewares,lib,config} tests/services prisma
echo "22" > .nvmrc

# 2. package.json / tsconfig / 各設定ファイル / ソースを配置
#    (本リポジトリのファイルを参照)

# 3. 依存インストール
npm install

# 4. 環境変数
cp .env.example .env                    # 中身を設定(DATABASE_URL / JWT_SECRET / PORT)

# 5. DB 起動 → テーブル作成 → 初期データ
docker compose up -d
npx prisma migrate dev --name init
npm run db:seed

# 6. 起動 & 確認
npm run dev
curl http://localhost:3000/health       # {"status":"ok"}

# 7. テスト
npm test                                # 10 passed
```

これで、今回作成したものと同じバックエンドが再現できます。
