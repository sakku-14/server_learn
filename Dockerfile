# ---- build: 全依存をインストールして TypeScript をビルド ----
FROM node:22-slim AS build
WORKDIR /app
# Prisma のクエリエンジンが OpenSSL を必要とする
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---- deps: 本番実行に必要な依存のみをインストール ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# ---- runtime: 実行用の最小イメージ ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
# build ステージで prisma generate 済みのクライアントを重ねる
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY package.json ./
# 非 root ユーザーで実行する(コンテナ侵害時の影響を最小化)
USER node
EXPOSE 3000
# マイグレーション(prisma migrate deploy)はデプロイパイプライン側で実行する。
CMD ["node", "dist/index.js"]
