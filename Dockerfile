# 打卡系統的 Docker 映像（給 VM 上的備援用；正式站在 Vercel，不用這個）。
# GitHub Actions 每次推到 main 會自動建好放到 ghcr.io/doraeyi/zengji-punch（見 .github/workflows/docker.yml）。
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY deploy/backup/sync.mjs ./deploy/backup/sync.mjs
EXPOSE 3000
CMD ["node", "build"]
