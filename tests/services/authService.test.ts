import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../../src/services/authService.js';
import { userRepository } from '../../src/repositories/userRepository.js';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';
import { hashRefreshToken } from '../../src/lib/refreshToken.js';
import { AppError } from '../../src/lib/errors.js';

// Repository は実 DB に接続せず、モックで差し替える。
vi.mock('../../src/repositories/userRepository.js', () => ({
  userRepository: {
    findByEmail: vi.fn(),
    findByRefreshTokenHash: vi.fn(),
    updateRefreshToken: vi.fn(),
    create: vi.fn(),
  },
}));

const mockUser = {
  id: 1,
  email: 'test1@example.com',
  password: await hashPassword('password123'),
  name: 'テストユーザー1',
  refreshTokenHash: null,
  refreshTokenExpiresAt: null,
  createdAt: new Date(),
};

describe('authService.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('新規メールでユーザーを作成しトークンを発行する', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(userRepository.create).mockResolvedValue(mockUser);
    vi.mocked(userRepository.updateRefreshToken).mockResolvedValue(mockUser);

    const result = await authService.register({
      name: 'テストユーザー1',
      email: 'test1@example.com',
      password: 'password123',
    });

    expect(result.token).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
    expect(result.user).toEqual({ id: 1, name: 'テストユーザー1', email: 'test1@example.com' });
    expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(
      1,
      hashRefreshToken(result.refreshToken),
      expect.any(Date),
    );
  });

  it('パスワードは平文ではなく Argon2 ハッシュで保存する', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(userRepository.create).mockResolvedValue(mockUser);
    vi.mocked(userRepository.updateRefreshToken).mockResolvedValue(mockUser);

    await authService.register({
      name: 'テストユーザー1',
      email: 'test1@example.com',
      password: 'password123',
    });

    const created = vi.mocked(userRepository.create).mock.calls[0]?.[0];
    expect(created?.password).not.toBe('password123');
    expect(created?.password).toMatch(/^\$argon2/);
    await expect(verifyPassword(created!.password, 'password123')).resolves.toBe(true);
  });

  it('メールが既に登録済みなら CONFLICT を投げる', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);

    await expect(
      authService.register({
        name: 'テストユーザー1',
        email: 'test1@example.com',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('名前が空なら VALIDATION_ERROR を投げる', async () => {
    await expect(
      authService.register({ name: '', email: 'test1@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('メール形式が不正なら VALIDATION_ERROR を投げる', async () => {
    await expect(
      authService.register({ name: 'テスト', email: 'invalid', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('パスワードが8文字未満なら VALIDATION_ERROR を投げる', async () => {
    await expect(
      authService.register({ name: 'テスト', email: 'test1@example.com', password: 'short' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正しい資格情報でトークンを発行しリフレッシュトークンを更新する', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(userRepository.updateRefreshToken).mockResolvedValue(mockUser);

    const result = await authService.login({
      email: 'test1@example.com',
      password: 'password123',
    });

    expect(result.token).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
    expect(result.user).toEqual({ id: 1, name: 'テストユーザー1', email: 'test1@example.com' });
    expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(
      1,
      hashRefreshToken(result.refreshToken),
      expect.any(Date),
    );
  });

  it('メール形式が不正なら VALIDATION_ERROR を投げる', async () => {
    await expect(
      authService.login({ email: 'invalid', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('パスワードが8文字未満なら VALIDATION_ERROR を投げる', async () => {
    await expect(
      authService.login({ email: 'test1@example.com', password: 'short' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('ユーザーが存在しなければ UNAUTHORIZED を投げる', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

    await expect(
      authService.login({ email: 'none@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });

  it('パスワードが一致しなければ UNAUTHORIZED を投げる', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);

    await expect(
      authService.login({ email: 'test1@example.com', password: 'wrongpassword' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
  });
});

describe('authService.refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('有効なリフレッシュトークンで新しいセッションを発行する(ローテーション)', async () => {
    const stored = {
      ...mockUser,
      refreshTokenHash: hashRefreshToken('old-refresh-token'),
      refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    vi.mocked(userRepository.findByRefreshTokenHash).mockResolvedValue(stored);
    vi.mocked(userRepository.updateRefreshToken).mockResolvedValue(stored);

    const result = await authService.refresh({ refreshToken: 'old-refresh-token' });

    expect(userRepository.findByRefreshTokenHash).toHaveBeenCalledWith(
      hashRefreshToken('old-refresh-token'),
    );
    // 使用済みトークンは新しいトークンで上書きされる(ローテーション)
    expect(result.refreshToken).not.toBe('old-refresh-token');
    expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(
      1,
      hashRefreshToken(result.refreshToken),
      expect.any(Date),
    );
  });

  it('該当ユーザーがいなければ UNAUTHORIZED を投げる', async () => {
    vi.mocked(userRepository.findByRefreshTokenHash).mockResolvedValue(null);

    await expect(authService.refresh({ refreshToken: 'unknown-token' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('期限切れなら UNAUTHORIZED を投げる', async () => {
    vi.mocked(userRepository.findByRefreshTokenHash).mockResolvedValue({
      ...mockUser,
      refreshTokenHash: hashRefreshToken('expired-token'),
      refreshTokenExpiresAt: new Date(Date.now() - 1000),
    });

    await expect(authService.refresh({ refreshToken: 'expired-token' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
    expect(userRepository.updateRefreshToken).not.toHaveBeenCalled();
  });

  it('refreshToken が空なら VALIDATION_ERROR を投げる', async () => {
    await expect(authService.refresh({ refreshToken: '' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  });
});

describe('authService.logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('リフレッシュトークンを破棄する', async () => {
    vi.mocked(userRepository.updateRefreshToken).mockResolvedValue(mockUser);

    await authService.logout(1);

    expect(userRepository.updateRefreshToken).toHaveBeenCalledWith(1, null, null);
  });
});
