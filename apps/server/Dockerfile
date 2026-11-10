FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @aura/shared-types build && pnpm --filter @aura/server build
ENV NODE_ENV=production
WORKDIR /app/apps/server
CMD ["sh", "-c", "node dist/database/migrate-cli.js && node dist/main.js"]
