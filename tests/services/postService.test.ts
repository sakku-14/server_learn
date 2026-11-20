import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postService } from '../../src/services/postService.js';
import { postRepository } from '../../src/repositories/postRepository.js';

vi.mock('../../src/repositories/postRepository.js', () => ({
  postRepository: {
    findById: vi.fn(),
  },
}));

const mockPost = {
  id: 1,
  title: 'title',
  body: 'body',
  tags: ['a', 'b'],
  likes: 10,
  dislikes: 2,
  views: 100,
  userId: 3,
  createdAt: new Date(),
};

describe('postService.getPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('likes / dislikes を reactions にまとめて返す(createdAt は含めない)', async () => {
    vi.mocked(postRepository.findById).mockResolvedValue(mockPost);

    const post = await postService.getPost(1);

    expect(post).toEqual({
      id: 1,
      title: 'title',
      body: 'body',
      tags: ['a', 'b'],
      reactions: { likes: 10, dislikes: 2 },
      views: 100,
      userId: 3,
    });
  });

  it('存在しない投稿は NOT_FOUND を投げる', async () => {
    vi.mocked(postRepository.findById).mockResolvedValue(null);

    await expect(postService.getPost(999)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});
