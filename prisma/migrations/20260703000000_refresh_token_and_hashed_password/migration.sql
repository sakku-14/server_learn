-- 認証方式の変更:
-- - current_token(無期限JWTの後勝ち保存)を廃止
-- - 短命アクセストークン + リフレッシュトークン方式に移行(ハッシュと有効期限を保存)
-- - 既存の password カラムには以後 Argon2id ハッシュを保存する(開発データはシードで再投入)

ALTER TABLE "users" DROP COLUMN "current_token";

ALTER TABLE "users" ADD COLUMN "refresh_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "refresh_token_expires_at" TIMESTAMP(3);

CREATE INDEX "users_refresh_token_hash_idx" ON "users"("refresh_token_hash");
