import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService } from '../../src/services/userService.js';
import { userRepository } from '../../src/repositories/userRepository.js';

vi.mock('../../src/repositories/userRepository.js', () => ({
  userRepository: {
    findById: vi.fn(),
    updateName: vi.fn(),
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

describe('userService.updateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('名前を前後の空白を除去して更新し、更新後のプロフィールを返す', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
    vi.mocked(userRepository.updateName).mockResolvedValue({ ...mockUser, name: '新しい名前' });

    const profile = await userService.updateProfile(1, { name: '  新しい名前  ' });

    expect(userRepository.updateName).toHaveBeenCalledWith(1, '新しい名前');
    expect(profile).toEqual({ id: 1, name: '新しい名前', email: 'test1@example.com' });
  });

  it.each([
    ['name なし', {}],
    ['空文字', { name: '' }],
    ['空白のみ', { name: '   ' }],
    ['51 文字', { name: 'あ'.repeat(51) }],
    ['文字列以外', { name: 123 }],
  ])('%s は VALIDATION_ERROR を投げ更新しない', async (_label, input) => {
    await expect(userService.updateProfile(1, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(userRepository.updateName).not.toHaveBeenCalled();
  });

  it('50 文字ちょうどは更新できる', async () => {
    const name = 'あ'.repeat(50);
    vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
    vi.mocked(userRepository.updateName).mockResolvedValue({ ...mockUser, name });

    await expect(userService.updateProfile(1, { name })).resolves.toMatchObject({ name });
  });

  it('存在しなければ NOT_FOUND を投げ更新しない', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);

    await expect(userService.updateProfile(999, { name: '名前' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(userRepository.updateName).not.toHaveBeenCalled();
  });
});
