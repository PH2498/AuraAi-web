# AURA AI 开发进度

更新日期：2026-11-08  
工程根目录：`/Users/haopeixian/Desktop/Aura AI/AuraAi-web`  
下次开工先读本文件，再看 `docs/IMPLEMENTATION_AUDIT.md`（Phase 0 审计，描述的是开工前的空目录）。

设计资源和开发文档都在仓库外，只读，不要改：

- 视觉基准：`../设计资源/AURA-AI`（v2「Presence」）
- 开发文档：`../开发文档/AURA_AI_Cursor_Development`

## 当前阶段

**Phase 2 界面已接到页面上，尚未验收结束，不要开始 Phase 3。**

Phase 0 审计、Phase 1 工程骨架已完成。没有 Electron，没有真实对话、登录或业务表。

## 已经完成

### Phase 1

- pnpm workspace：`apps/web`、`apps/server`、`packages/shared-types`、`packages/api-client`、`packages/platform`、`packages/config`
- Nest `/api/v1/health` 与 `/api/v1/health/ready`。数据库未就绪时 ready 返回 503，正文不打印连接串
- Drizzle 基线迁移。本机 PostgreSQL 16 已安装，库 `aura`、用户 `aura` 与 `.env.example` 一致，迁移已执行过
- 服务端开发用 `tsc --watch` 再启动 `dist/main.js`。不要改回 `tsx watch`，否则 Nest 读不到构造函数依赖
- Web 通过 Vite 代理 `/api`。工作区 CJS 包由 `vite.config.ts` 里的 `workspace-cjs` 转成 ESM
- `three` 必须用精确别名 `/^three$/`，否则 `three/addons/...` 会解析失败
- lint、typecheck、14 个测试在 2026-11-08 通过

### Phase 2

- 设计 CSS、字体、Lucide 图标、logo、vendored Three 和 `aura-core3d.js` 已复制进 `apps/web`。设计源文件未改
- 六个页面的样式加了 `body[data-page]` 前缀，避免拼在一起后互相覆盖
- 路由：`/`、`/conversations`、`/conversations/:id`（`new` 为新对话）、`/vision`、`/tasks`、`/tasks/:id`、`/memory`、`/settings`、`/settings/:section`
- 全站一颗 WebGL Core，跟着当前页的槽位移动。首页半径按设计稿的 `placeCore` 计算（待机放大 1.72，阅读时收回）
- 命令栏、模型菜单、文件名芯片、语音 / 摄像头 / 屏幕按钮已接上
- 标题栏连接状态默认 **未配置**。只有本次会话里 Ollama `/api/tags` 探测成功，且当前模型是本地模型时，才显示已连接
- 对话、任务、记忆里的内容都标明演示。任务确认不会发信或移动文件。视觉分析只说明模型未接入
- 设置里「登录时启动」「关闭窗口时」禁用，文案是桌面版尚未提供。外观固定深色
- 记忆存在 `localStorage` 键 `aura-memories`。设置存在 `aura-web-settings`，不要读原型的 `aura-settings`

## 本地怎么跑

```bash
corepack pnpm install
corepack pnpm db:migrate
corepack pnpm dev
```

- 页面：http://127.0.0.1:5173
- 健康：http://127.0.0.1:3000/api/v1/health
- 就绪：http://127.0.0.1:3000/api/v1/health/ready
- 本机 `psql` 在 `/opt/homebrew/opt/postgresql@16/bin`，`~/.zshrc` 已加入 PATH
- `.env` 不提交。示例值在 `.env.example`

## 下次从这里继续

Phase 2 还要对照设计稿看这些地方，验收通过后再进 Phase 3：

1. 首页阅读态、命令栏菜单、会话抽屉和窄宽度下的顶栏，和 `home-v2.html` 再对一遍
2. 对话、视觉、任务、记忆、设置九个分区的空状态、搜索和动效
3. 减少动态（设置里选「减少动态」）和 WebGL 失败时的 `no-webgl` 回退
4. 摄像头、麦克风、屏幕共享的允许与拒绝两条路径。拒绝时提示来自平台层，不要假装已经打开
5. 快捷键：⌘K、⌥Space、⌘J、⌘N、⌘,、⌘1–5、Esc、⌘⇧.

Phase 3 才做：登录、业务表、真实模型对话。在此之前不要把演示回复改成真实请求，也不要做 Electron。

## 不要动

- `../设计资源/AURA-AI` 和 `../开发文档`
- `.env`、密钥、数据库连接串的日志
- 把提供方显示成已连接，除非这次会话里的探测真的成功
