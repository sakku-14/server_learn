import { hash, verify } from '@node-rs/argon2';

/**
 * パスワードを Argon2id でハッシュ化する。
 * Argon2id は OWASP 推奨のパスワードハッシュアルゴリズム。ソルトは自動生成され
 * ハッシュ文字列に埋め込まれるため、DB にはこの戻り値をそのまま保存すればよい。
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** 平文パスワードがハッシュと一致するか検証する。不正なハッシュ形式でも false を返す。 */
export function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return verify(hashed, password).catch(() => false);
}
