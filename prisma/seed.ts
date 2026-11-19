import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

// 開発用ダミーデータ。パスワードは投入時に Argon2id でハッシュ化する(平文: password123)。
const SEED_USERS = [
  { id: 1, name: 'テストユーザー1', email: 'test1@example.com', password: 'password123' },
  { id: 2, name: 'テストユーザー2', email: 'test2@example.com', password: 'password123' },
  { id: 3, name: 'テストユーザー3', email: 'test3@example.com', password: 'password123' },
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
    `SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))`
  );

  console.log(`Seeded ${SEED_USERS.length} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
