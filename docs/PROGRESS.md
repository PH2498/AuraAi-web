# AURA AI 开发进度

更新日期：2026-11-08  
工程根目录：`/Users/haopeixian/Desktop/Aura AI/AuraAi-web`  
下次开工先读本文件，再看 `docs/IMPLEMENTATION_AUDIT.md`（Phase 0 审计，描述的是开工前的空目录）。

设计资源和开发文档都在仓库外，只读，不要改：

- 视觉基准：`../设计资源/AURA-AI`（v2「Presence」）
- 开发文档：`../开发文档/AURA_AI_Cursor_Development`

## 当前阶段

**Phase 3 后端基础已接到数据库，页面仍使用标明过的演示数据。**

Phase 2 界面验收已完成。真实模型对话属于 Phase 4，这一阶段没有调用模型。

### Phase 3 已接上

- 表：`users`、`sessions`、`conversations`、`messages`、`provider_configs`、`audit_logs`。迁移文件是 `apps/server/drizzle/0001_phase3.sql`
- 登录 `POST /api/v1/auth/login` 写入 HttpOnly、SameSite=Lax 的 `aura_session`。生产环境再加 Secure。退出和 `GET /api/v1/auth/me` 已接上。没有公开注册
- 库里还没有用户、且同时配置了 `AURA_BOOTSTRAP_EMAIL` 与 `AURA_BOOTSTRAP_PASSWORD` 时，启动会创建第一个账号。密码短于 8 位不会创建
- 会话和消息按 `user_id` 隔离。别人的会话返回 404。消息按 sequence 保存，这一阶段只入库，不生成回复
- 提供方密钥用 AES-256-GCM 加密。列表和创建响应只有 `keyConfigured` 与末四位 `keyHint`
- 登录、退出、会话和提供方变更写入审计日志，日志里不放密钥和密码
- 开发环境 Swagger 在 `/api/v1/docs`，使用 cookie `aura_session`
- 集成测试覆盖隔离、消息历史、密钥加密和错误密码。2026-11-08 通过

页面上的对话、任务和记忆仍是浏览器里的演示。下一步可以把这些页面改成读写上面的接口。

### Phase 2 验收

对照 `05-分阶段实施与验收.md`：

- 六个页面和标题栏、命令栏、确认框、提示都按 v2 Presence 的结构接上，页面本身是组件，不是整页截图
- 桌面宽度下首页舞台、任务列表和详情没有明显错位。任务筛选在 340px 侧栏里可以横向滚动，和设计稿一致
- 控件有真实的基础行为：导航、搜索、筛选、记忆查看/编辑、对话动作、设置九组、Ollama 探测、麦克风电平和摄像头预览
- WebGL 不可用时给 `body` 加上 `no-webgl`，并提示已切换到兼容模式
- 「减少动态」和系统减少动态都会给 `html` 加上 `reduce-motion`
- 字体、Lucide 图标、logo 和本地 Three 核心都来自设计资源。Geist 许可在 `/fonts/LICENSE-Geist-OFL.txt`

网页版的边界保持不变：登录时启动和关闭窗口时仍显示桌面版尚未提供；提供方只有本次 Ollama 探测成功才显示已连接；不在浏览器里保存密钥；回复、任务和记忆里的示例都标明演示。

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

下面几项已经接上，验收时直接点：

- 首页会话抽屉可搜索，打开后焦点在搜索框。Esc 先关菜单和抽屉，再停感知
- ⌘K 聚焦命令栏，⌥Space 开关麦克风，⌘J 开关首页抽屉，⌘N 在阅读态回到待命、否则去新对话，⌘, 打开设置，⌘1–5 切导航，⌘⇧. 停止感知
- 设置搜索会展开匹配的分区；没有匹配时显示空状态
- 「减少动态」和系统「减少动态」都会给 `html` 加上 `reduce-motion`。WebGL 失败时加 `no-webgl` 并提示已切换到兼容模式
- 宽度不超过 1120 时，各页顶栏只保留当前导航的文字。对话页在这个宽度下用标题栏的列表按钮或 ⌘J 打开会话列表，打开后焦点在搜索框；上下文用标题旁的按钮打开。Esc 先关掉这两个浮层
- 摄像头、麦克风、屏幕被拒绝时，提示用平台层原文：`摄像头权限被拒绝`、`麦克风权限被拒绝`、`屏幕共享被拒绝`。视觉页的说明同步这句话，画面保持关闭。允许后才会挂上真实媒体流，并写明模型未接入、不会分析
- 首页发送后进入阅读态：问候隐藏，Core 收到 140px，回复列按「你 / AURA / 演示步骤」排开。步骤结束后动作条出现，可复制演示回复
- 对话搜索、任务筛选、记忆搜索没有结果时，用设计稿的空状态（图标、标题、说明，搜索可清除）。视觉未开启时显示步骤说明，侧栏是「还没有结论」
- 对话、视觉、任务、记忆的主要区域带 `data-enter`，入场动画是 `page-in`
- 确认对话框按设计稿的遮罩、风险行和按钮。任务「知道了，这只是演示」要先勾选确认，关闭后只去掉待确认标记。记忆删除可取消；确认后出现带「撤销」的提示
- 对话页可以固定、重命名、复制为 Markdown，删除前会确认并可以撤销。新对话有三条建议，点开会留下标明未接入的演示回复。右侧上下文列出画面、工具、记忆和隐私，内容保持为空
- 记忆条目先打开查看侧栏（正文、分类、来源、时间、是否固定）。编辑和「添加」共用表单：最多 240 字、分类、固定开关；空白保存会标红并留在表单里。已有条目点取消回到查看，新建点取消或 Esc 关闭
- 任务筛选按「全部、进行中、待确认、已完成、失败」排列，每项带数量。标题显示「当前条数 / 总条数」。筛选或搜索把当前任务排除时，详情改到仍可见的第一条。Esc 在没有对话框时清空搜索
- 顶栏在页面之间切换时，当前页先加上 `leaving` 再进入下一页。同一页里换任务或会话不会整页离场
- 对话回复下方有复制、重新生成、朗读。重新生成只补一条演示说明。朗读用浏览器语音，读的是页面上的演示文字
- 设置九组都已接上。搜索按条目文字过滤。语音可以测试麦克风和朗读一句。摄像头预览离开该页会停止。导出的 JSON 不含密钥。清空未固定记忆可以撤销。恢复默认只清设置
- 核心画质的「省电 / 高画质」会调用核心的画质切换。图形设备名称来自这台机器的 WebGL 渲染器
- 任务详情标题带状态：待确认、进行中、已完成、失败

Phase 2 验收已通过。Phase 3 的接口和集成测试已通过；页面仍使用演示数据。真实模型对话属于 Phase 4，不要做 Electron。

## 不要动

- `../设计资源/AURA-AI` 和 `../开发文档`
- `.env`、密钥、数据库连接串的日志
- 把提供方显示成已连接，除非这次会话里的探测真的成功
