# AURA AI

Web-first 全栈工程。Phase 1 骨架和 Phase 2 Presence 界面已经在页面上。还没有接模型，也没有 Electron。下次开工先读 `docs/PROGRESS.md`。

设计基准在仓库外，只读：`../设计资源/AURA-AI`（v2「Presence」）。开发文档在 `../开发文档/AURA_AI_Cursor_Development`。

## 环境

- Node.js 22 或更新版本
- pnpm 10。本机如果没有全局 `pnpm`，用 `corepack pnpm`
- PostgreSQL 16。用 Docker Compose 启动；没有数据库时，存活检查仍然可用，就绪检查和迁移会说明数据库未就绪

## 启动

```bash
cp .env.example .env   # 仓库里已有本地 .env 时可跳过
corepack pnpm install
docker compose up -d   # 需要 Docker
corepack pnpm db:migrate
corepack pnpm dev
```

服务端开发进程先用 TypeScript 编译再启动，Nest 才能读到构造函数上的依赖类型。

- Web：http://127.0.0.1:5173
- API：http://127.0.0.1:3000/api/v1/health
- 就绪：http://127.0.0.1:3000/api/v1/health/ready
- Swagger（仅开发）：http://127.0.0.1:3000/docs

首页是 Presence 界面。模型未探测成功时，标题栏显示「未配置」。数据库就绪检查在 `/api/v1/health/ready`。

## 检查

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

密钥只放在服务端 `.env`。`.env` 不提交。`.env.example` 只有占位值。
