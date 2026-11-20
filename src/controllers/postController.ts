import type { Context } from 'hono';
import { postService } from '../services/postService.js';
import type { AppEnv } from '../types.js';

export const postController = {
  /** GET /posts/{id} */
  async getPost(c: Context<AppEnv>, id: number) {
    const post = await postService.getPost(id);
    return c.json(post, 200);
  },
};
