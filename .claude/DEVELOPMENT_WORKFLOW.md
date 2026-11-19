# 機能追加の開発手順書(これを見ながら 1 機能を実装する)

このドキュメントは、**すでに動いているこのバックエンドに、新しい機能を 1 つ追加する** ときの進め方を、**バックエンド開発が初めての人** 向けに順を追ってまとめたものです。
「どの層から手を付ける?」「マイグレーションはいつ?」「テストと動作確認は?」で迷わないよう、**1 つの具体例を最初から最後まで** 通します。

## 他のドキュメントとの違い

| ドキュメント | 役割 |
|---|---|
| [`../README.md`](../README.md) | 環境構築・起動・API 仕様(**使う側**の視点) |
| [`./BUILD_GUIDE.md`](./BUILD_GUIDE.md) | **ゼロから同じ物を作る** 再現手順(プロジェクトを最初に立ち上げる視点) |
| **このドキュメント** | **既存プロジェクトに機能を 1 つ足す** ときの進め方(日々の開発の視点) |

> 用語(API・エンドポイント・ORM・JWT など)の基本解説は `BUILD_GUIDE.md` の「用語集」にまとまっています。このドキュメントでは、機能追加で新たに出てくる語だけ解説します。

## 前提:このアプリの構造(レイヤード)

リクエストは、外側から内側へ **層(レイヤー)** を順に通って DB に届き、また戻ってきます。

```
リクエスト
  → Router      (どの窓口かを振り分ける)        src/routes/
  → Controller  (入力を取り出し、結果を返す)      src/controllers/
  → Service     (本質的な判断・処理=ビジネスロジック) src/services/
  → Repository  (DB の読み書きだけ)              src/repositories/
  → DB (PostgreSQL)
```

機能追加とは基本的に、**この層のいくつか(or 全部)に少しずつコードを足していく** 作業です。「どの層を触るか」を STEP 2 で見極めるのがコツです。

---

## 全体の流れ(チートシート)

まず全体像。詳細は各 STEP を参照してください。**毎回この順で進めれば迷いません。**

| STEP | やること | コマンド/対象 |
|---|---|---|
| 0 | 準備(環境を立ち上げ、ブランチを切る) | `nvm use` / `docker compose up -d` / `git switch -c` |
| 1 | 要件を言葉にする | (紙・メモ。コードは書かない) |
| 2 | 設計する(どの層を触るか決める) | チェックリストで判断 |
| 3 | DB を変える(必要なときだけ) | `schema.prisma` 編集 → `prisma migrate dev` |
| 4 | 内側から実装する | Repository → Service → Controller → Route |
| 5 | API 仕様に反映(自動) | `createRoute` を書くだけ → `/reference` に出る |
| 6 | テストを書いて通す | `npm test` |
| 7 | 動作確認する | `npm run dev` → `curl` / ブラウザ |
| 8 | 整える(lint/format/型) | `npm run lint` / `npm run format` |
| 9 | コミット & PR | `git commit` → `git push` → PR |

> **このドキュメントで使う具体例**
> 「**ユーザーに電話番号(phone)を追加する**」機能を題材にします。
> - `PATCH /users/me` … 電話番号を登録/更新する(認証必須)
> - `GET /users/me` … レスポンスに電話番号も含める(既存窓口の拡張)
>
> この例は **新しい DB カラムの追加(=マイグレーション)を伴う** ため、全 STEP を一度に体験できます。

---

## STEP 0: 始める前に(準備)

**目的:** 手を動かす前に、開発環境を立ち上げ、作業用の「枝」を用意する。

```bash
nvm use                 # Node を 22 に合わせる(.nvmrc 準拠)
docker compose up -d    # DB(PostgreSQL)を起動
git switch -c feat/user-phone   # 作業用ブランチを作って移動
```

> **ブランチとは?**
> Git の「作業用の枝」。`main`(完成版が乗る幹)を直接いじらず、機能ごとに枝を分けて作業する。こうすると、未完成のコードが `main` を壊さず、レビューもしやすい。`feat/user-phone` のように「種類/内容」で名前を付けるのが慣習(`feat`=新機能, `fix`=バグ修正)。

> **なぜ最初にブランチを切るのか?**
> 後から「実は main で直接作業していた」となると整理が大変。**作業開始時にまず枝を作る** のが安全。

動作確認(DB が起きているか):

```bash
docker compose ps        # postgres が Up になっていれば OK
```

---

## STEP 1: 要件を言葉にする

**目的:** コードを書く前に「何を作るのか」を一文ずつ確定させる。ここが曖昧だと手戻りが増える。

最低限、次の項目を埋めます。

| 項目 | 今回の例(phone 機能) |
|---|---|
| 何を | ユーザーが自分の電話番号を登録・更新できるようにする |
| 誰が | ログイン済みの本人(認証必須) |
| どの窓口で | `PATCH /users/me`(更新)、`GET /users/me`(取得時に含める) |
| 入力 | `{ "phone": "09012345678" }` |
| 出力 | 更新後のユーザー情報(`id, name, email, phone`) |
| 入力ルール | phone は 10〜11 桁の数字のみ。任意(空でも可) |
| エラー | 形式不正なら 400、未ログインなら 401 |

> **なぜ「窓口(メソッド+パス)」をここで決めるのか?**
> 「更新」は慣習的に `PATCH`(一部変更)または `PUT`(全置換)を使う。今回は一部のフィールドだけ変えるので `PATCH`。この慣習に沿うと、API を使う側(アプリ担当)が直感的に理解できる。

> **PATCH とは?** HTTP メソッドの一種で「リソースの一部を更新する」意味。`GET`=取得、`POST`=作成/送信、`DELETE`=削除、`PATCH`=部分更新、と覚える。

---

## STEP 2: 設計する(どの層を触るか決める)

**目的:** STEP 1 の要件から、**触る層** を洗い出す。これが実装の地図になる。

次のチェックリストで判断します。

| 問い | Yes なら触る層 | 今回の例 |
|---|---|---|
| DB に新しいデータを保存する? | `schema.prisma` + マイグレーション | ✅ phone カラムを追加 |
| 外部からの入力を受け取る? | Service の Zod スキーマ(`validate()`) | ✅ phone の形式チェック |
| 認証が必要? | Route に `auth` ミドルウェア | ✅(既存の `auth` を流用) |
| DB を読み書きする? | Repository | ✅ phone を更新する関数 |
| 判断・加工のロジックがある? | Service | ✅ 更新処理 |
| 新しい窓口(URL)が増える? | Route(`createRoute`)+ Controller | ✅ `PATCH /users/me` |

→ 今回は **Prisma / Repository / Service / Controller / Route の 5 層 + テスト** を触る、と確定。

> **なぜ先に「どの層を触るか」を決めるのか?**
> 行き当たりばったりで書くと、層をまたいだ修正で混乱する。先に地図を描いておくと、**STEP 4 で迷わず順番に埋めるだけ** になる。

---

## STEP 3: DB を変更する(必要なときだけ)

> **この STEP は「新しいデータを保存する機能」のときだけ** 必要です。
> 例えば「既存データを返すだけ」「集計するだけ」の機能なら DB 変更は不要なので、**この STEP は飛ばして STEP 4 へ** 進みます。

**目的:** 電話番号を保存する場所(カラム)を DB に用意する。

### 3-1. スキーマ(設計図)を編集する

`prisma/schema.prisma` の `User` に 1 行追加します。

```prisma
model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  password     String
  name         String
  phone        String?  @map("phone")            // ← 追加。? は「空でも可」
  currentToken String?  @map("current_token")
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("users")
}
```

> **なぜ `String?`(? 付き)なのか?**
> `?` は「**NULL を許す**(値がなくてもよい)」という意味。電話番号は任意入力なので、未登録のユーザーがいても良いように `?` を付ける。`?` を付けないと「必須」になり、既存ユーザーの行に値が無くてマイグレーションが失敗する。

### 3-2. マイグレーションを実行する

```bash
npx prisma migrate dev --name add_user_phone
```

> **マイグレーションとは?**(`BUILD_GUIDE.md` でも解説)
> スキーマ(設計図)の変更を **実際の DB に反映** し、その変更を履歴(SQL ファイル)として残す作業。`--name` には「何をしたか」を書く(例: `add_user_phone`)。これにより、他の人の環境でも同じ手順で DB を再現できる。

このコマンド 1 つで、(1) 変更 SQL の生成、(2) DB への適用、(3) Prisma Client(TypeScript から DB を触るコード)の再生成、がまとめて行われます。

### 3-3. シードの確認(任意)

`prisma/seed.ts` のテストユーザーに phone を足したい場合はここで追記します(必須ではない)。

---

## STEP 4: 内側から実装する(Repository → Service → Controller → Route)

**目的:** 機能の中身を、**DB に近い内側から外側へ** 順に作る。

> **なぜ内側(Repository)から作るのか?**
> Controller は Service を呼び、Service は Repository を呼ぶ。**呼ばれる側(内側)を先に作る** と、外側を書くときには「呼ぶ相手が既にある」状態になり、順番に組み上げられる。逆順だと「まだ無い関数」を呼ぶ未完成コードが増えて確認しづらい。

### 4-1. Repository:DB 操作を 1 つ足す

`src/repositories/userRepository.ts` に、既存の `updateCurrentToken` と同じ書式で追加します。

```ts
/** 電話番号を更新する。 */
updatePhone(id: number, phone: string) {
  return prisma.user.update({
    where: { id },
    data: { phone },
  });
},
```

> Repository は **DB の読み書きだけ** を担当。ここに「形式チェック」や「判断」は書かない(それは Service の仕事)。役割を分けることで、後で修正する場所が明確になる。

### 4-2. Service:入力検証 + ロジック

`src/services/userService.ts` に、Zod スキーマと更新処理を追加します。入力検証は既存の `validate()`(`src/lib/validation.ts`)をそのまま再利用します。

```ts
import { z } from 'zod';
import { validate } from '../lib/validation.js';
// ... 既存の import に追記

export const updatePhoneSchema = z.object({
  phone: z
    .string()
    .regex(/^\d{10,11}$/, '電話番号は10〜11桁の数字で入力してください'),
});

// userService オブジェクトの中に追加
async updatePhone(userId: number, input: unknown): Promise<AuthUser & { phone: string | null }> {
  const { phone } = validate(updatePhoneSchema, input);  // 不正なら 400 を自動で投げる

  const user = await userRepository.findById(userId);
  if (!user) {
    throw notFound('ユーザーが見つかりません');
  }

  const updated = await userRepository.updatePhone(userId, phone);
  return { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone };
},
```

> **なぜ検証(バリデーション)を Service に置くのか?**
> 「電話番号は数字 10〜11 桁」というのは **このアプリ固有のルール(ビジネスロジック)**。Service に集約しておけば、どの窓口から呼ばれても同じルールが効く。`validate()` は失敗時に統一エラー `{ code: 'VALIDATION_ERROR', detail: {...} }` を自動で投げてくれる(自分で try/catch を書かなくてよい)。

### 4-3. Controller:入出力の交通整理

`src/controllers/userController.ts` に、既存の `getMe` と同じ `Context<AppEnv>` 形でハンドラを追加します。

```ts
/** PATCH /users/me */
async updateMe(c: Context<AppEnv>) {
  const user = c.get('user');                    // auth ミドルウェアが入れた本人情報
  const body = await c.req.json().catch(() => ({}));
  const profile = await userService.updatePhone(user.id, body);  // 判断は Service に任せる

  c.get('logger').info({ userId: user.id }, '電話番号を更新');
  return c.json(profile, 200);
},
```

> Controller は「入力を取り出す → Service を呼ぶ → 結果を返す」だけ。**判断ロジックを持たない** のがルール。薄く保つことで、テストは Service に集中できる。

### 4-4. Route + OpenAPI:窓口を定義する

`src/routes/userRoutes.ts` に、既存の `getMeRoute` と同じ構造で `createRoute` を書き、`.openapi()` で接続します。共通部品(`apiVersionHeader` / `BEARER_AUTH` / `errorResponse`)は `src/lib/openapi.ts` から再利用します。

```ts
// 入力スキーマ(リクエストボディ)
const UpdatePhoneRequest = z
  .object({ phone: z.string().openapi({ example: '09012345678' }) })
  .openapi('UpdatePhoneRequest');

const patchMeRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['User'],
  summary: '電話番号を更新',
  description: '認証中ユーザーの電話番号を登録/更新する。',
  security: [{ [BEARER_AUTH]: [] }],     // 認証必須(Bearer トークン)
  request: {
    headers: apiVersionHeader,
    body: { content: { 'application/json': { schema: UpdatePhoneRequest } } },
  },
  responses: {
    200: {
      description: '更新後のプロフィール',
      content: { 'application/json': { schema: UserResponse } },  // 既存の UserResponse を流用
    },
    400: errorResponse('バリデーションエラー'),
    401: errorResponse('認証失敗'),
    404: errorResponse('ユーザーが見つからない'),
  },
});

userRoutes.openapi(patchMeRoute, (c) => userController.updateMe(c));
```

> 既存の `userRoutes` は冒頭で `use('*', apiVersion)` と `use('*', auth)` を通しているため、**この新しい窓口も自動で認証必須** になります(個別に書く必要なし)。

> `GET /users/me` のレスポンスにも phone を含めたい場合は、`UserResponse` スキーマに `phone` を 1 行足し、`userService.getProfile` の戻り値に `phone` を含めればOK(既存窓口の小さな拡張)。

---

## STEP 5: API 仕様への反映(自動)

**目的:** 仕様書を更新する……が、**手作業は不要**。

STEP 4-4 で `createRoute` を書いた時点で、API 仕様書(Scalar UI)に **自動で反映** されています。これがこのプロジェクトの「コードファースト」設計の利点です。

- `http://localhost:3000/reference` … 新しい `PATCH /users/me` が増えているのを目視で確認
- `http://localhost:3000/doc` … OpenAPI JSON にも反映

> 仕組みと「なぜ手書きしないのか」の詳細は `BUILD_GUIDE.md` の「API 仕様書の自動生成(OpenAPI / Scalar)」を参照。**仕様書を別ファイルで二重管理しない** ので、実装と仕様がズレません。

---

## STEP 6: テストを書いて通す

**目的:** ロジックが意図通りか、機械に繰り返し検証させる。

このプロジェクトでは **Service 層** をテスト対象にします(最も重要なロジックが集まる層のため)。`tests/services/userService.test.ts` に、既存テストと同じ `vi.mock` 方式で追加します。

```ts
it('正しい電話番号で更新できる', async () => {
  vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
  vi.mocked(userRepository.updatePhone).mockResolvedValue({ ...mockUser, phone: '09012345678' });

  const result = await userService.updatePhone(1, { phone: '09012345678' });

  expect(result.phone).toBe('09012345678');
});

it('桁数が不正なら VALIDATION_ERROR を投げる', async () => {
  await expect(
    userService.updatePhone(1, { phone: '123' }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
});
```

> **なぜ `vi.mock` で Repository を偽物にするのか?**
> 本物の DB に繋ぐとテストが遅く・不安定になる。Repository を「偽物(モック)」に差し替えれば、**DB なしでロジックだけを高速に** 検証できる。

最低限カバーしたいケース:

| ケース | 期待 |
|---|---|
| 正常な入力 | 更新後の値が返る |
| 形式が不正(桁数違い等) | `VALIDATION_ERROR`(400) |
| ユーザーが存在しない | `NOT_FOUND`(404) |

実行:

```bash
npm test     # 既存 + 追加分が全部 green になれば OK
```

---

## STEP 7: 動作確認する

**目的:** 実際にサーバーを動かし、リクエストを送って期待通り動くか確かめる。

```bash
npm run dev   # サーバー起動(http://localhost:3000)
```

別のターミナルから `curl` で確認します(ログインして token を得てから操作)。

```bash
# 1. ログインして token を取得
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "Api-Version: 1" \
  -d '{"email":"test1@example.com","password":"password123"}'

# 2. 電話番号を更新(上で得た token を使う)
curl -X PATCH http://localhost:3000/users/me \
  -H "Content-Type: application/json" \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <token>" \
  -d '{"phone":"09012345678"}'

# 3. 取得して反映を確認
curl http://localhost:3000/users/me \
  -H "Api-Version: 1" \
  -H "Authorization: Bearer <token>"
```

ブラウザで `http://localhost:3000/reference` を開き、`PATCH /users/me` が仕様書に出ていることも確認します。

期待する挙動:

| 操作 | 期待結果 |
|---|---|
| 正しい phone で更新 | 200 + 更新後の値 |
| 桁数が不正な phone | 400(項目ごとのエラーメッセージ) |
| token なしで更新 | 401 |

---

## STEP 8: 整える(lint / format / 型チェック)

**目的:** コードの体裁と型の整合を、コミット前にそろえる。

```bash
npm run lint            # 文法・書き方のチェック(ESLint)
npm run format          # 自動整形(Prettier)
npx tsc --noEmit        # 型エラーがないか確認(ファイル出力はしない)
```

> **なぜ lint / format をかけるのか?**
> 人によってインデントや書き方がバラつくと、後でレビューや差分が読みにくくなる。ツールで **機械的に統一** しておくと、本質的な内容のレビューに集中できる。

---

## STEP 9: コミット & PR

**目的:** 変更を記録(コミット)し、`main` に取り込む提案(PR)を出す。

```bash
git add -A
git commit -m "feat: ユーザーに電話番号(phone)を追加"
git push -u origin feat/user-phone
```

その後、GitHub で **Pull Request(PR)** を作成します。

> **PR(プルリクエスト)とは?**
> 「自分のブランチの変更を `main` に取り込んでほしい」という **提案・レビュー依頼**。レビュアーが差分を見て、問題なければ承認 → マージ(`main` に合流)する。いきなり `main` を書き換えず、**一度レビューを挟む** ための仕組み。

> **なぜ機能を小さく区切って PR を出すのか?**
> 1 つの PR が巨大だとレビューが大変でバグも見つけにくい。「電話番号の追加」のように **意味のある最小単位** で出すと、レビューが速く・安全になる。

コミットメッセージの慣習(例):

| 接頭辞 | 意味 |
|---|---|
| `feat:` | 新機能 |
| `fix:` | バグ修正 |
| `docs:` | ドキュメントのみ |
| `refactor:` | 動作を変えない内部改善 |
| `test:` | テストの追加・修正 |

---

## よくある詰まりどころ

機能追加のときに踏みやすい問題と対処。

| 症状 | 原因 | 対処 |
|---|---|---|
| `401 Unauthorized` が返る | `Authorization: Bearer <token>` を付け忘れ / 別端末で再ログインして古い token が無効化(後勝ち方式) | 直前にログインして得た token を使う。後勝ちの仕組みは `BUILD_GUIDE.md` 参照 |
| `400`(Api-Version エラー) | `Api-Version: 1` ヘッダーの付け忘れ | `/health` 以外の全リクエストに必須 |
| 更新したのに DB に反映されない / 型エラー | マイグレーション未実行 | `npx prisma migrate dev --name ...` を実行したか確認 |
| `npm test` が `crypto...` で落ちる | Node が 16 など古い | `nvm use`(Node 22)に切り替える |
| 仕様書(`/reference`)に新窓口が出ない | `createRoute` を `.openapi()` で接続し忘れ | `userRoutes.openapi(route, handler)` の行があるか確認 |
| 起動時に「環境変数の読み込みに失敗」 | `.env` 未設定 | `.env` の `DATABASE_URL` / `JWT_SECRET` を確認 |

---

## 用語集(このドキュメントで増えたもの)

API・エンドポイント・ORM・JWT・マイグレーション等の基本語は `BUILD_GUIDE.md` の用語集を参照。ここでは機能追加で新たに出た語を補足します。

| 用語 | 意味 |
|---|---|
| **ブランチ** | Git の作業用の枝。機能ごとに分けて `main` を直接いじらず作業する。 |
| **PR(プルリクエスト)** | 自分のブランチの変更を `main` に取り込む提案・レビュー依頼。 |
| **マージ** | 承認された PR の変更を `main` に合流させること。 |
| **PATCH / PUT** | 更新系の HTTP メソッド。PATCH=一部更新、PUT=全置換。 |
| **NULL 許可(`String?`)** | その列に値が無くてもよい、という指定。任意項目に使う。 |
| **コミットメッセージ規約** | `feat:` `fix:` 等の接頭辞で変更の種類を表す慣習。 |

---

## まとめ:機能追加の最短フロー

```bash
# 0. 準備
nvm use && docker compose up -d
git switch -c feat/xxx

# 1-2. 要件と設計(どの層を触るか)を紙で固める

# 3. DB 変更(必要なときだけ)
#    schema.prisma を編集 →
npx prisma migrate dev --name add_xxx

# 4. 内側から実装: Repository → Service → Controller → Route(createRoute)

# 5. 仕様は createRoute を書けば /reference に自動反映

# 6. テスト
npm test

# 7. 動作確認
npm run dev      # 別ターミナルで curl / ブラウザで /reference

# 8. 整える
npm run lint && npm run format && npx tsc --noEmit

# 9. コミット & PR
git add -A && git commit -m "feat: ..." && git push -u origin feat/xxx
```

この順番を毎回なぞれば、機能追加で迷うことはありません。
