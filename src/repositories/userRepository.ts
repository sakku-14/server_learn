import { prisma } from '../lib/prisma.js';

/** users テーブルへの DB 操作を担う層。 */
export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  findByRefreshTokenHash(refreshTokenHash: string) {
    return prisma.user.findFirst({ where: { refreshTokenHash } });
  },

  create(data: { name: string; email: string; password: string }) {
    return prisma.user.create({ data });
  },

  /**
   * リフレッシュトークンを上書きする(後勝ち方式: 最後にログインした端末のみ有効)。
   * ログアウト時は null を渡して破棄する。
   */
  updateRefreshToken(id: number, refreshTokenHash: string | null, expiresAt: Date | null) {
    return prisma.user.update({
      where: { id },
      data: { refreshTokenHash, refreshTokenExpiresAt: expiresAt },
    });
  },

  updateName(id: number, name: string) {
    return prisma.user.update({ where: { id }, data: { name } });
  },

  deleteById(id: number) {
    return prisma.user.delete({ where: { id } });
  },
};
