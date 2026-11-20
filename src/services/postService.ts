import { postRepository } from '../repositories/postRepository.js';
import { notFound } from '../lib/errors.js';

/** GET /posts/{id} のレスポンス形式。likes / dislikes は reactions にまとめて返す。 */
export interface PostDetail {
  id: number;
  title: string;
  body: string;
  tags: string[];
  reactions: { likes: number; dislikes: number };
  views: number;
  userId: number;
}

export const postService = {
  /** 投稿詳細を取得する。 */
  async getPost(postId: number): Promise<PostDetail> {
    const post = await postRepository.findById(postId);
    if (!post) {
      throw notFound('投稿が見つかりません');
    }
    return {
      id: post.id,
      title: post.title,
      body: post.body,
      tags: post.tags,
      reactions: { likes: post.likes, dislikes: post.dislikes },
      views: post.views,
      userId: post.userId,
    };
  },
};
