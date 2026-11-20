import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

// 開発用ダミーデータ。パスワードは投入時に Argon2id でハッシュ化する(平文: password123)。
const SEED_USERS = [
  { id: 1, name: 'テストユーザー1', email: 'test1@example.com', password: 'password123' },
  { id: 2, name: 'テストユーザー2', email: 'test2@example.com', password: 'password123' },
  { id: 3, name: 'テストユーザー3', email: 'test3@example.com', password: 'password123' },
];

// 開発用の投稿データ。アプリは現在 id=1 固定で GET /posts/{id} を呼ぶため、id=1 は必ず残すこと。
const SEED_POSTS = [
  {
    id: 1,
    title: 'His mother had always taught him',
    body: "His mother had always taught him not to ever think of himself as better than others. He'd tried to live by this motto. He never looked down on those who were less fortunate or who had less money than him. But the stupidity of the group of people he was talking to made him change his mind.",
    tags: ['history', 'american', 'crime'],
    likes: 192,
    dislikes: 25,
    views: 305,
    userId: 1,
  },
  {
    id: 2,
    title: 'He was an expert but not in a discipline',
    body: 'He was an expert but not in a discipline that anyone could fully appreciate. He knew how to hold the cone just right so that the soft server ice-cream fell into it at the precise angle to form a perfect cone each and every time.',
    tags: ['french', 'fiction', 'english'],
    likes: 859,
    dislikes: 32,
    views: 4884,
    userId: 2,
  },
  {
    id: 3,
    title: 'Dave watched as the forest burned up on the hill.',
    body: 'Dave watched as the forest burned up on the hill, only a few miles from her house. The car had been hastily packed and Marta was inside trying to round up the last of the pets.',
    tags: ['magical', 'history', 'french'],
    likes: 1448,
    dislikes: 39,
    views: 4152,
    userId: 3,
  },
  {
    id: 4,
    title: 'タグのない投稿',
    body: 'tags が空配列のケースを確認するための投稿です。',
    tags: [],
    likes: 0,
    dislikes: 0,
    views: 0,
    userId: 1,
  },
];

async function main() {
  for (const user of SEED_USERS) {
    const password = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { id: user.id },
      update: { name: user.name, email: user.email, password },
      create: { ...user, password },
    });
  }
  // 明示 id で投入したため、autoincrement のシーケンスを実データの最大 id に同期させる。
  // これをしないと登録 API が id=1 から採番し、既存行と衝突して P2002 が発生する。
  await prisma.$executeRawUnsafe(
    `SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))`,
  );

  for (const post of SEED_POSTS) {
    await prisma.post.upsert({
      where: { id: post.id },
      update: post,
      create: post,
    });
  }
  await prisma.$executeRawUnsafe(
    `SELECT setval('posts_id_seq', (SELECT COALESCE(MAX(id), 1) FROM posts))`,
  );

  console.log(`Seeded ${SEED_USERS.length} users, ${SEED_POSTS.length} posts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
