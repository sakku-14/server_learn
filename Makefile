# ============================================================
#  app backend — 開発用 Makefile
#  使い方:  make help
# ============================================================

# docker-compose.yml と .env のデフォルトに合わせる
DB_USER := app
DB_NAME := app

# 必要な Node のメジャーバージョン (.nvmrc は 22)
REQUIRED_NODE_MAJOR := 18

# recipe を bash で実行し、nvm を読み込んで .nvmrc の Node へ自動切替する。
# これにより 'nvm use' を手動でやらなくても make 系コマンドが正しい Node で動く。
SHELL := /bin/bash
USE_NODE := . "$$HOME/.nvm/nvm.sh" >/dev/null 2>&1; nvm use >/dev/null;

# .env が無いときに書き込むローカル開発デフォルト (README 記載値)
ENV_DATABASE_URL := postgresql://app:app@localhost:5432/app?schema=public
ENV_JWT_SECRET   := dev-local-secret-change-me
ENV_PORT         := 3000

.DEFAULT_GOAL := help
.PHONY: help up down restart setup check-node logs ps seed migrate reset studio test lint format clean fclean

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

## ---- 主要コマンド ----

check-node: ## Node のバージョンを確認 (.nvmrc の Node に自動切替)
	@$(USE_NODE) \
	major=$$(node -v 2>/dev/null | sed -E 's/v([0-9]+).*/\1/'); \
	if [ -z "$$major" ]; then \
	  echo "✗ node が見つかりません。'nvm install $$(cat .nvmrc)' を実行してください"; exit 1; \
	fi; \
	if [ "$$major" -lt $(REQUIRED_NODE_MAJOR) ]; then \
	  echo "✗ Node v$$major では Prisma が動きません (.nvmrc は $$(cat .nvmrc))。"; \
	  echo "  → 'nvm install $$(cat .nvmrc)' で Node をインストールしてから再実行してください"; \
	  exit 1; \
	fi

up: check-node node_modules .env ## 起動: 初回は自動セットアップ→DB起動→開発サーバーを前面実行 (停止: Ctrl+C)
	@docker compose up -d
	@printf "DB の起動を待機中"; \
	  until docker compose exec -T postgres pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; do \
	    printf "."; sleep 1; done; echo " OK"
	@$(USE_NODE) npx prisma generate >/dev/null
	@$(USE_NODE) npx prisma migrate deploy
	@$(USE_NODE) if [ "$$(docker compose exec -T postgres psql -U $(DB_USER) -d $(DB_NAME) -tAc 'SELECT count(*) FROM users' 2>/dev/null || echo 0)" = "0" ]; then \
	    echo "初回起動: シードデータを投入します"; npm run db:seed; \
	  fi
	@echo "==> 開発サーバーを起動します (停止: Ctrl+C / DB停止: make down)"
	@$(USE_NODE) npm run dev

down: ## 終了: DB コンテナを停止 (データは保持)
	docker compose down

restart: down up ## 再起動 (down → up)

setup: check-node node_modules .env ## 準備だけ実行 (DB起動+migrate+seed、devは起動しない)
	@docker compose up -d
	@printf "DB の起動を待機中"; \
	  until docker compose exec -T postgres pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; do \
	    printf "."; sleep 1; done; echo " OK"
	@$(USE_NODE) npx prisma generate >/dev/null
	@$(USE_NODE) npx prisma migrate deploy
	@$(USE_NODE) npm run db:seed
	@echo "==> セットアップ完了。'make up' で開発サーバーを起動できます"

## ---- 補助コマンド ----

logs: ## DB コンテナのログを表示 (Ctrl+C で抜ける)
	docker compose logs -f postgres

ps: ## コンテナの状態を表示
	docker compose ps

seed: ## シードデータを投入
	@$(USE_NODE) npm run db:seed

migrate: ## マイグレーション作成+適用 (prisma migrate dev)
	@$(USE_NODE) npm run prisma:migrate

reset: ## DB を全削除→再マイグレーション→再シード
	@$(USE_NODE) npx prisma migrate reset

studio: ## Prisma Studio を起動
	@$(USE_NODE) npm run prisma:studio

test: ## テスト (統合テストが DB を使うため Postgres を起動してから実行)
	@docker compose up -d
	@printf "DB の起動を待機中"; \
	  until docker compose exec -T postgres pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; do \
	    printf "."; sleep 1; done; echo " OK"
	@$(USE_NODE) npm test

lint: ## ESLint
	@$(USE_NODE) npm run lint

format: ## Prettier で整形
	@$(USE_NODE) npm run format

clean: ## node_modules / dist を削除
	rm -rf node_modules dist

fclean: ## コンテナ+DBデータ削除 & node_modules/dist 削除 (完全初期化)
	docker compose down -v
	rm -rf node_modules dist

## ---- 内部ターゲット (ファイル存在を保証) ----

node_modules: package.json
	@$(USE_NODE) npm install
	@touch node_modules

.env:
	@printf 'DATABASE_URL="%s"\nJWT_SECRET="%s"\nPORT=%s\n' \
	  '$(ENV_DATABASE_URL)' '$(ENV_JWT_SECRET)' '$(ENV_PORT)' > .env
	@echo "==> .env をローカル開発デフォルトで生成しました"
