import { prisma } from '../lib/prisma.js';

/** posts テーブルへの DB 操作を担う層。 */
export const postRepository = {
  findById(id: number) {
    return prisma.post.findUnique({ where: { id } });
  },
};
