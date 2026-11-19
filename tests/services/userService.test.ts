import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService } from '../../src/services/userService.js';
import { userRepository } from '../../src/repositories/userRepository.js';

vi.mock('../../src/repositories/userRepository.js', () => ({
  userRepository: {
    findById: vi.fn(),
    deleteById: vi.fn(),
  },
}));

const mockUser = {
  id: 1,
  email: 'test1@example.com',
  password: 'password123',
  name: 'テストユーザー1',
  currentToken: 'token',
  createdAt: new Date(),
};

describe('userService.getProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('存在するユーザーのプロフィールを返す', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

    const profile = await userService.getProfile(1);

    expect(profile).toEqual({ id: 1, name: 'テストユーザー1', email: 'test1@example.com' });
  });

  it('存在しなければ NOT_FOUND を投げる', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);

    await expect(userService.getProfile(999)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});

describe('userService.deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('存在するユーザーを削除する', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
    vi.mocked(userRepository.deleteById).mockResolvedValue(mockUser);

    await userService.deleteAccount(1);

    expect(userRepository.deleteById).toHaveBeenCalledWith(1);
  });

  it('存在しなければ NOT_FOUND を投げ削除しない', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);

    await expect(userService.deleteAccount(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(userRepository.deleteById).not.toHaveBeenCalled();
  });
});
