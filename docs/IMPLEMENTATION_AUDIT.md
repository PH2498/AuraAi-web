# AURA AI · Phase 0 实施审计

> 这是开工前的审计。当前进度在 `docs/PROGRESS.md`。下面「空目录」的描述已经过时。

> 2026-11-08 已确认：工程根目录为 `/Users/haopeixian/Desktop/Aura AI/AuraAi-web`。设计资源仍留在 `../设计资源/AURA-AI`，不复制、不改动。

审计日期：2026-11-08  
范围：工作区根目录、开发文档、OpenDesign v2「Presence」设计交付。  
本文件只记录现状与 Phase 1 计划。未修改设计源文件，未编写业务代码，未创建 Electron 工程。

## 1. 结论

当前工作区没有可运行的 Web / Server 工程，也没有可复用的 React 或 NestJS 代码。视觉基准是 `设计资源/AURA-AI` 中的 **v2「Presence」** HTML 原型，不是通用后台，也不是 v1。

实现时以设计稿为准：

- 产品页是空间界面：全屏 AURA Core、玻璃命令栏、标题栏胶囊导航、四角 HUD。没有左侧菜单，也没有卡片墙。
- 页面之间共用同一颗 Core。导航时 Core 带着上一页的位置飞到下一页。
- 七种 Core 状态靠运动区分，界面强调色始终是 Electric Cyan，每屏不超过两处。
- 原型里的对话、任务、文件操作是脚本演示，并在部分文案中标明「原型示例数据」。生产实现不得把这些脚本当成已完成的 AI、工具或文件系统能力。

建议路由与开发文档一致，交互结构尊重设计稿，不把多页面原型改成侧边栏工作台。

## 2. 仓库现状

工作区：`/Users/haopeixian/Desktop/Aura AI`

| 路径                                               | 状态                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `开发文档/AURA_AI_Cursor_Development/`             | 6 份开发文档齐全，只读依据                                                             |
| `设计资源/AURA-AI/`                                | OpenDesign 最终交付，只读视觉基准                                                      |
| `AuraAi-web/`                                      | 空目录。内部有 Git，但 `main` 没有任何提交，`origin/main` 已不存在，没有远程，没有源码 |
| 工作区根目录                                       | 不是 Git 仓库。没有 `package.json`、lockfile、`pnpm-workspace.yaml`、`.env`            |
| `apps/`、`packages/`、`design/`、`docs/`（审计前） | 不存在。本审计新建 `docs/IMPLEMENTATION_AUDIT.md`                                      |

包管理器尚未选定落地。开发文档指定 pnpm workspace。本机是否已安装 pnpm，留到 Phase 1 安装时确认。

`AuraAi-web` 不能当作已有前端复用。Phase 1 不应往这个空仓库里写代码，除非确认工程根目录改到这里。

## 3. 设计基准

用户指定路径：`/Users/haopeixian/Desktop/Aura AI/设计资源/AURA-AI`。  
开发文档中的 `design/` 目录目前不存在。设计文件没有移动、复制或改名。

打开说明：解压后用浏览器打开 `index.html` 或 `home-v2.html`。`file://` 走打包脚本，HTTP 走 ES Module。需要 WebGL 2。

### 3.1 版本

| 版本           | 角色                   | 文件                                                                                                                                                                                        |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2「Presence」 | **实现基准**           | `index.html`、`home-v2.html`、`conversations.html`、`vision.html`、`tasks.html`、`memory.html`、`settings.html`、`design-system-v2.html`、`aura-logo.html`、`brand-spec.md`、`assets/v2/**` |
| v1             | 存档，不实现           | `design-system.html`、`brand-spec-v1.md`、`assets/aura.css`、`assets/aura-core.js`                                                                                                          |
| v1 Home        | 目录页有链接，文件缺失 | `index.html` 指向 `home.html`，该文件不存在                                                                                                                                                 |

v1 与 v2 的色值、字体和布局都不同。v1 背景 `#080D16`、强调色 `#66D9F2`、正文含 Inter。v2 背景 `#070A12`、强调色 `#53DFFF`、正文跟随系统字体。实现只取 v2。

`brand-spec.md` 写玻璃 `blur(24px)`。落地样式 `assets/v2/aura.css` 是 `blur(26px) saturate(150%)`。像素还原以 CSS 为准。

### 3.2 源码与打包

`assets/v2/*.js` 是可读源码。`assets/v2/app/*.js` 是 `scripts/bundle-app.mjs` 用 esbuild 打出的 IIFE，供 `file://` 使用。`app/core.js` 内嵌了压缩后的 Three.js。React 移植读源码，不读打包产物。

`home.js` 自带一套外壳逻辑，不引用 `shell.js`。其余产品页通过 `shell.js` + `command.js` 共用外壳。两套行为需要对齐到同一套 React 组件，不能做出两个导航实现。

## 4. 设计 Token

全部来自 `assets/v2/aura.css` 的 `:root`。Tailwind 必须映射这些变量，不能使用默认色板。

### 4.1 颜色

| Token                            | OKLch                             | Hex / 规则        | 用途                         |
| -------------------------------- | --------------------------------- | ----------------- | ---------------------------- |
| `--bg`                           | `oklch(14.6% 0.018 266.8)`        | `#070A12`         | 空间背景                     |
| `--surface`                      | `oklch(21.8% 0.034 261.5)`        | `#111A2A`         | 浮层基色                     |
| `--fg`                           | `oklch(97.6% 0.011 269.6)`        | `#F4F7FF`         | 主文字                       |
| `--muted`                        | `oklch(67.0% 0.033 260.7)`        | `#8A96AA`         | 次级文字                     |
| `--border`                       | `oklch(97.6% 0.011 269.6 / 0.09)` | 由 `--fg` 派生    | 发丝描边                     |
| `--accent`                       | `oklch(84.1% 0.126 216.0)`        | `#53DFFF`         | 唯一界面强调色               |
| `--bg-2`                         | `oklch(18.4% 0.030 265.8)`        | `#0C1220`         | 次级背景                     |
| `--faint`                        | `oklch(50.0% 0.039 259.4)`        | `#56647A`         | 刻度、分隔、禁用。不用于正文 |
| `--aurora`                       | `oklch(62.9% 0.198 267.3)`        | `#547DFF`         | Core 执行 / 环境光           |
| `--violet`                       | `oklch(65.9% 0.197 290.7)`        | `#9575FF`         | Core 思考                    |
| `--soft`                         | `oklch(93.3% 0.032 258.4)`        | `#DCEAFF`         | Core 内核、回应              |
| `--success`                      | `oklch(79.1% 0.135 164.8)`        | 沿用 v1 `#55D6A5` | 完成                         |
| `--warning`                      | `oklch(82.9% 0.119 77.4)`         | 沿用 v1 `#F2BD69` | 警告、麦克风指示             |
| `--danger`                       | `oklch(71.4% 0.180 17.6)`         | 沿用 v1 `#FF6B78` | 错误、Core 异常              |
| `--void`                         | `oklch(6% 0.015 266)`             | —                 | 画面底、代码底               |
| `--glass`                        | surface 60%                       | —                 | 命令栏、导航胶囊             |
| `--glass-strong`                 | surface 88%                       | —                 | 菜单、抽屉、弹窗             |
| `--hover` / `--press` / `--wash` | fg 7% / 12% / 4%                  | —                 | 悬停、按下、弱底             |
| `--blur-glass`                   | `blur(26px) saturate(150%)`       | —                 | 仅浮层                       |
| `--sheen`                        | 顶部 1px 白 8% 内高光             | —                 | 玻璃顶边                     |
| `--ring`                         | 2px `--bg` + 4px `--accent`       | —                 | 焦点环                       |

窗口控件色：`--tl-close`、`--tl-min`、`--tl-max`、`--win-close`。原型里交通灯和 Windows 按钮是 `aria-hidden` 的视觉装饰，没有真正的窗口行为。

对比度（设计系统实测）：主文字/背景 18.5:1，次级文字/背景 6.6:1，主按钮文字/青色 12.6:1，`--faint`/背景 3.3:1。

### 4.2 字体

| 角色    | 字体栈                                                                                | 文件                                       |
| ------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| Display | Geist → SF Pro Display → Segoe UI Variable Display → PingFang SC → Microsoft YaHei UI | `assets/v2/fonts/Geist-Variable.woff2`     |
| Body    | 系统字体：SF Pro Text / Segoe UI / 苹方 / 微软雅黑                                    | 不打包西文字体                             |
| Mono    | Geist Mono → SF Mono → Cascadia Code                                                  | `assets/v2/fonts/GeistMono-Variable.woff2` |

许可：`assets/v2/fonts/LICENSE-Geist-OFL.txt`（SIL OFL 1.1）。

| 档位    | 规格                                                    |
| ------- | ------------------------------------------------------- |
| Hero    | `clamp(34px, 3.1vw, 46px)` · 500 · −0.032em · 行高 1.12 |
| Display | 28px · 520–540                                          |
| Title   | 19–22px · 540–560                                       |
| H3      | 16px · 560                                              |
| Body-lg | 15.5px · 行高 1.78（对话正文）                          |
| Body    | 13.5–14px                                               |
| Meta    | 12px · `--muted`                                        |
| Micro   | 11–11.5px Geist Mono · 字距约 0.08em                    |

界面语言是简体中文。设置里语言下拉是禁用的「简体中文」。

### 4.3 间距、圆角、动效

间距 4pt：4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72。  
圆角：6 / 8 / 12 / 16 / 22 / 999。命令栏用 22，胶囊用 999。

一条进入曲线 `cubic-bezier(.22, 1, .36, 1)`，退出 `cubic-bezier(.4, 0, 1, 1)`。

| Token         | 时长         | 用途                                               |
| ------------- | ------------ | -------------------------------------------------- |
| `--dur-micro` | 160ms        | 悬停、按下、颜色                                   |
| `--dur-panel` | 280ms        | 菜单、抽屉、导航指示                               |
| `--dur-page`  | 380ms        | 阅读模式、页面、弹窗                               |
| `--dur-core`  | 700ms        | Core 状态。运行时用指数平滑 τ = 0.3s，约 0.8s 收敛 |
| 按下缩放      | 90ms 量级    | 按钮 0.975，图标按钮 0.94                          |
| 命令栏流光    | 6s / 圈      | `@property --edge-a`，聚焦或聆听时出现             |
| 状态文案      | stagger 12ms | Blur reveal                                        |
| 扫描线        | 900–1800ms   | Vision 分析、空间画面帧                            |

`prefers-reduced-motion` 与设置项「减少动态」把动画压到 1ms。Core 另有 `reduced` 标志，运动速度降到 0.12。低画质关闭 Bloom，粒子降到约 2400，DPR 上限 1。帧率低于 40 且画质为自动时，原型会自己降到低画质。

标题栏高度 `--titlebar-h: 46px`。

### 4.4 窗口

| 尺寸      | 设计规则                                                 |
| --------- | -------------------------------------------------------- |
| 1024×680  | 最小可用。导航只显示当前项文字。HUD 隐藏。命令栏占满宽度 |
| 1280×800  | HUD 出现（≥1240）。命令栏 760px。最近会话 2 条           |
| 1440×900  | 基准。Core 半径约舞台高度一半。空间标签左右分栏          |
| 1920×1080 | 最近会话 3 条（≥1680）。阅读列宽仍 760，不拉伸           |

对话页：<1440 上下文改为右侧抽屉；<1120 会话索引改为左侧抽屉。  
设置页：<980 左侧导航收成图标。  
任务页：<1100 列表栏收到 280px。

## 5. 图标、图片、标识

### 5.1 图标

`assets/v2/icons.js` 是内联 SVG sprite，Lucide 0.460，描边 1.6，圆角端点。尺寸 14 / 16 / 18 / 20。不用 Emoji 做功能图标。共 156 个 symbol，`id` 形如 `i-house`。

产品实际用到的核心图标：`house`、`messages-square`、`scan-eye`、`list-checks`、`brain`、`settings`、`panel-left`、`search`、`paperclip`、`monitor`、`camera`、`webcam`、`audio-lines`、`mic`、`arrow-up`、`square`、`hard-drive`、`cloud`、`chevron-down`、`power`、`shield-check`、`triangle-alert`、`circle-check`、`circle-alert`、`loader-circle`。完整名单以 `icons.js` 为准。

Phase 2 应继续使用这份 sprite，或按同名、同描边接入 `lucide-react`。不能换成另一套图标。

### 5.2 图片

产品界面几乎不靠位图。唯一内容图：

- `assets/v2/shots/home-capture.jpg`：对话与视觉演示里的屏幕截图缩略图。

禁止把整页截图当成页面背景。

### 5.3 标识

| 文件                                                         | 用途                                    |
| ------------------------------------------------------------ | --------------------------------------- |
| `assets/v2/logo/aura-mark.svg`                               | 透明底图形                              |
| `assets/v2/logo/aura-mark-mono.svg`                          | `currentColor` 单色                     |
| `assets/v2/logo/aura-lockup.svg`                             | 横式组合                                |
| `assets/v2/logo/aura-app-icon.svg`                           | 深色圆角方，favicon、设置、关于         |
| `aura-app-icon-16.svg` / `32.svg` / `aura-app-icon-pack.svg` | 小尺寸                                  |
| `aura-tray-template.svg` 与 `logo/packaging/**`              | 未来桌面打包。Phase 1–8 不接入 Electron |

字标规则：字母 A 两笔，横杠是能量轨道，轨道角度 −24° 与 +38° 不能改。标题栏只用单色字标。彩色只出现在应用图标、启动页和关于页。字标是全大写 `AURA`，不要写成 Aura AI，也不要把标语放进图标。

标题栏字标在各产品页里是内联 SVG，不引用彩色 `aura-mark.svg`。

### 5.4 第三方运行时（仅原型）

| 文件                                                               | 用途                                |
| ------------------------------------------------------------------ | ----------------------------------- |
| `assets/vendor/three/three.module.min.js` 及 postprocessing addons | Core 的 Three.js + UnrealBloom      |
| `assets/vendor/motion.js`                                          | `window.Motion.animate` / `stagger` |

React 工程改用正式依赖 `three`、`@react-three/fiber`（或保留命令式 `AuraCore3D` 类并用 `useEffect` 挂载）、`motion`。着色器、轨道参数和状态机以 `aura-core3d.js` 为源，不能换成通用渐变球。

## 6. 页面与路由映射

原型是多 HTML 页面，靠 `sessionStorage['aura-core-at']` 做 Core 飞跃。React 做成 SPA，保留同一颗 Core 和同样的过渡，不复制五套 Canvas。

设置不在胶囊导航里，是标题栏右侧图标。开发文档建议的路由与此一致。

| 设计文件                  | 路由                 | React 页面          | 说明                                                                                 |
| ------------------------- | -------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `index.html`              | 不作为产品路由       | —                   | 设计交付目录。可留在设计资源里，不进应用导航                                         |
| `home-v2.html`            | `/`                  | `HomePage`          | 空间舞台。阅读模式仍留在主页，不强制跳到对话页                                       |
| `conversations.html`      | `/conversations`     | `ConversationsPage` | 索引 + 对话列 + 上下文栏                                                             |
| `conversations.html#<id>` | `/conversations/:id` | 同上                | `#c-design` 等是原型深链。生产用真实会话 id                                          |
| `conversations.html#new`  | `/conversations/new` | 同上                | 空对话                                                                               |
| `vision.html`             | `/vision`            | `VisionPage`        | 画面 + 洞察栏                                                                        |
| `tasks.html`              | `/tasks`             | `TasksPage`         | 步骤流，不是看板                                                                     |
| `tasks.html#<id>`         | `/tasks/:id`         | 同上                |                                                                                      |
| `memory.html`             | `/memory`            | `MemoryPage`        | 分组列表 + 右侧 sheet                                                                |
| `settings.html`           | `/settings`          | `SettingsPage`      | 九组，默认通用                                                                       |
| `settings.html#<sec>`     | `/settings/:section` | 同上                | `general` `models` `voice` `vision` `privacy` `memory` `shortcuts` `runtime` `about` |
| `design-system-v2.html`   | 不进产品路由         | —                   | 规范页。Phase 2 对照用，不做成用户功能                                               |
| `aura-logo.html`          | 不进产品路由         | —                   | 标识规范。关于页使用同一套 SVG                                                       |
| `home-v2.html?os=win`     | 查询参数或设置       | `AppShell`          | `data-os=mac\|win`。跟随系统，也可在设置里固定                                       |

快捷键（原型已实现，Web 用 `meta`/`ctrl`）：

| 动作               | 键      |
| ------------------ | ------- |
| 聚焦命令栏         | ⌘K      |
| 语音               | ⌥ Space |
| 会话列表           | ⌘J      |
| 新对话             | ⌘N      |
| 设置               | ⌘,      |
| 五个主导航         | ⌘1–5    |
| 停止生成或当前感知 | Esc     |
| 停止全部感知       | ⌘⇧.     |

### 6.1 原型深链（Phase 2 对照用）

这些 hash 是设计走查入口，不是生产 URL 方案。

| 页面 | Hash / 查询                                                                                  | 状态                                       |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Home | 默认、`#boot`、`#first`                                                                      | 待命、启动                                 |
| Home | `#reading`                                                                                   | 思考后流式回复                             |
| Home | `#task`                                                                                      | 整理下载，授权弹窗                         |
| Home | `#error`、`#nokey`                                                                           | 连接失败、未配置 Key                       |
| Home | `?os=win`                                                                                    | Windows 标题栏                             |
| 对话 | `#c-design` `#c-remind` `#c-tray` `#c-bench` `#c-downloads` `#c-trip` `#c-standup` `#new`    | 屏幕上下文、工具结果、代码、云端、错误、空 |
| 视觉 | 默认、`#screen`、`#denied`、`#loading`                                                       | 摄像头待命、屏幕、权限拒绝、骨架           |
| 任务 | `#t-mail` `#t-archive` `#t-minutes` `#t-downloads` `#t-tray` `#t-remind` `#empty` `#loading` | 待确认、进行中、失败、完成、空、骨架       |
| 记忆 | 默认、`#empty`、`#loading`、`#m-*`                                                           | 列表、空、骨架、打开条目                   |
| 设置 | `#models` `#voice` `#privacy` `#runtime` `#loading` 等                                       | 对应分组或骨架                             |

## 7. 组件映射

设计系统第 11 节已经给出 React 组件名。下面是落地映射。共享壳放在 `components/`，页面只做组合。

| 设计组件                  | 原型                                | React                        | 关键 props / 状态                                                          |
| ------------------------- | ----------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `AppShell`                | 各页 `.titlebar` + canvas + veil    | `components/app-shell`       | `page`、`os`、连接状态、感知状态                                           |
| `AuraCore`                | `aura-core3d.js` `AuraCore3D`       | `components/aura-core`       | `state` `level` `amplitude` `progress` `ticks` `frame` `quality` `reduced` |
| `NavCapsule`              | `.navcap`                           | `app-shell/NavCapsule`       | 主页、对话、视觉、任务、记忆。任务可带待确认角标                           |
| `SensingIndicator`        | `.sensing`                          | `app-shell/SensingIndicator` | `mic` `camera` `screen` `onStopAll`                                        |
| `ConnectionPill`          | `#conn`                             | `app-shell/ConnectionPill`   | 本地就绪 / 未配置 / 仅本地 / 连接失败                                      |
| `Wordmark`                | 内联单色 SVG + `AURA`               | `app-shell/Wordmark`         | 单色。点击回主页（主页上是静态字标）                                       |
| `CommandBar`              | `.cmd`，`command.js` `mountCommand` | `components/command-input`   | `mode: idle \| listening \| busy`                                          |
| `ContextChip`             | `.ctx-chip`                         | `command-input/ContextChip`  | `screen \| camera \| image \| file`                                        |
| `ModelMenu`               | `#modelMenu`                        | `command-input/ModelMenu`    | 提供方、能力、连接状态。云端项标上传提示                                   |
| `SpatialTether`           | `.tethers`                          | `HomePage` 内                | 轨道上的空间标签，左右避让                                                 |
| `HudReadout`              | `.hud-bl` `.hud-br`                 | `HomePage` 内                | 感知、模型、fps。宽度 <1240 隐藏                                           |
| `SessionsDrawer`          | Home `.drawer`                      | `HomePage`                   | ⌘J。与对话页索引是两处入口，数据应同源                                     |
| `ActivityLog`             | `.activity`                         | 对话 / 主页回复              | 步骤名、说明、状态、耗时                                                   |
| `PermissionDialog`        | `.scrim .dialog`                    | `components/dialogs`         | 将执行、影响范围、不会做、可撤销。Esc = 拒绝                               |
| `Toast`                   | `.toast-stack`                      | `components/feedback`        | 标题栏下居中，不挡命令栏                                                   |
| `Sheet`                   | `.sheet`                            | 记忆详情                     | 右侧玻璃抽屉                                                               |
| `Lightbox`                | `shell.js` `lightbox`               | 对话截图                     | Esc 关闭                                                                   |
| `CoreSlot`                | `.core-slot`                        | 各页迷你命中区               | 点击语音，拖动旋转。Home 用 `.core-hit`                                    |
| `EmptyState` / `Skeleton` | `.empty-state` `.skel`              | `components/feedback`        | 空、加载                                                                   |

按钮变体：`btn-primary` `btn-secondary` `btn-ghost` `btn-quiet` `btn-danger`，另有 `icon-btn`、`switch`、`seg`、`select`、`range`、`pill`、`kbd`、`meter`、`notice`、`code`。同一视图只有一个青色主按钮。

### 7.1 AURA Core

类：`AuraCore3D`。状态与 `AuraState` 完全一致：

| state       | 中文 | 色相 token | 运动                                       | 驱动数据                           |
| ----------- | ---- | ---------- | ------------------------------------------ | ---------------------------------- |
| `idle`      | 待命 | `--soft`   | 呼吸、粒子低频漂移、膜面等高线             | 无                                 |
| `listening` | 聆听 | `--accent` | 粒子内收，声波环内聚                       | 麦克风 RMS。没有真实电平时不得假装 |
| `thinking`  | 思考 | `--violet` | 轨道分段加速，粒子压成吸积盘，刻度逐个点亮 | 推理阶段 n / done                  |
| `speaking`  | 回应 | `--soft`   | 波纹外扩，粒子随振幅外推                   | TTS RMS。文本流式时可为 token 到达 |
| `vision`    | 观察 | `--accent` | 扫描平面穿过核心，粒子分层                 | 采集帧 + 分析阶段                  |
| `executing` | 执行 | `--aurora` | 粒子并入轨道，中环按进度填充               | 0–1                                |
| `error`     | 异常 | `--danger` | 中环断开，运动变慢，内核低频脉动，不闪烁   | 错误码                             |

公开方法：`supported()` `setState` `setLevel` `setAmplitude` `setProgress` `setTicks` `setFrame` `setHover` `setPressed` `drag` `pulse` `setQuality` `ringPoint` `center` `onFrame` `destroy`。

构成：噪声位移能量膜、内核、粒子壳（默认 6500，产品页挂载时 Home 量级约 3600，设置页 1600 / 30fps）、三条轨道、视觉扫描平面、声波环、环境尘埃、UnrealBloom。WebGL 2 不可用时切到 `.stage-fallback` 径向渐变，并给 `body` 加 `no-webgl`。

卸载必须释放 geometry、material、texture、renderer、composer，并停掉 rAF。页面隐藏时降帧或暂停。

Home 阅读模式：Core 收到顶部 `clamp(104px, 15vh, 140px)`，问候语隐藏，回复列出现，暗角 `.veil` 加深。

## 8. 分页面交互

### 8.1 外壳（全部产品页）

- macOS 交通灯在左，Windows 控件在右。由 `data-os` 控制，控件本身不可操作。
- 胶囊当前项有滑动指示块。窄窗隐藏非当前项文字。
- 麦克风、摄像头、屏幕任一开启，标题栏出现对应药丸和「全部停止」。颜色：麦克风琥珀、摄像头绿、屏幕柔白。
- 连接药丸反映当前模型：本地就绪、云端已连接、未配置、仅本地模式、连接失败。
- 离开页面前把 Core 中心写入 `sessionStorage`，下一页从该位置飞入。SPA 里改为同一实例改 `setFrame`。

### 8.2 Home `/`

结构：舞台 Canvas、问候、命令坞、四角 HUD、会话抽屉、授权弹窗。

- 问候随时间变化（原型有时段文案）。状态眉：待命 / 聆听中 / 思考中 / 回应中 / 观察中 / 执行中 / 需要处理。
- Core 热区：点击或 ⌥ Space 开始语音；拖动旋转；悬停 360ms 后显示「点击开始语音 / 拖动旋转核心」。非 idle、拖动、阅读模式时提示隐藏。
- 命令栏：附件、截屏、摄像头取景器、模型菜单、语音、发送。空内容时发送禁用。生成中发送变为停止（方块）。Shift+Enter 换行，Enter 发送，Esc 停止。
- 聆听：命令栏切到转写，未确定文本用次级色，流光强度跟电平。语音按钮变为「完成」。
- 上下文芯片可移除。云端模型且带画面时，底部提示改为上传警告。
- 坞下「继续」是最近会话；聚焦输入时换成「试试」。阅读模式两者都隐藏。
- 空间标签用 `ringPoint` 贴在轨道上，带状态：pending / active / done。
- 摄像头取景器在命令栏上方，画面镜像。可切换设备、关闭、拍下这一帧。
- 会话抽屉可搜索。分组：今天 / 本周。
- 授权弹窗示例：整理「下载」128 个文件。必须写清将执行、影响范围、不会做、可撤销。按钮是「不允许」「允许并执行」。

原型 `home.js` 用正则把「提醒」「整理|下载」导向写死的回复和假文件操作，并在页脚写明没有访问文件系统。Phase 2 可以保留这些文案作为可关闭的设计夹具；Phase 4 起必须换成真实模型，不能保留假成功。

### 8.3 对话 `/conversations`

三栏：会话索引（默认 288px）、对话（列宽最多 800）、上下文（默认 300px）。

- 索引：计数、搜索标题和内容、高亮、清除搜索、新对话。行上有图标、标题、时间、摘要。进行中显示旋转图标。当前项 `aria-current`。
- 空对话：大号 Core、标题「新对话」、建议芯片。
- 有内容：标题可重命名，迷你 Core，元信息含状态点。操作：固定、重命名、上下文开关、更多。
- 更多菜单：复制 Markdown、固定到顶部、删除。删除要确认，并说明不会连带删除记忆和任务记录。
- 一轮对话不是左右气泡。用户是标题式提问，可带截图芯片；AURA 在下方用正文、列表、表格、代码块、工具时间线和结果卡回答。
- 工具步骤状态：`done` `active` `fail` `wait`。流式末尾有方块光标。停止后有「已停止」标记。
- 回答操作：复制、重试等，悬停或最后一条时显现。
- 上下文栏分组：画面、工具、记忆、隐私说明。本地为成功色盾牌，云端为警告色。
- 演示会话 7 条：`c-design` `c-remind` `c-tray` `c-bench` `c-downloads` `c-trip` `c-standup`。含屏幕图、提醒结果、代码 diff、LM Studio 连接失败、下载整理、云端模型、转写失败。

### 8.4 视觉 `/vision`

左画面，右洞察（384px，窄窗 320–340）。

- 来源：摄像头 / 屏幕。摄像头可选设备；屏幕是「选择屏幕或窗口」，必须走 `getDisplayMedia`。
- 采集：手动（默认）或持续。持续才显示间隔：2 / 5 / 10 / 30 秒。
- 隐私条：本地「不上传」；云端模型改为警告文案。上传策略来自设置：每次询问 / 本次会话记住 / 不允许。
- 画面：取景角标、扫描、四角 HUD（实时、分辨率、分析状态、画面变化百分比）。分辨率和变化量必须来自真实像素。
- 控制：开启 / 暂停 / 显示变化区域 / 「分析这一帧」（Space）。未开启时分析禁用。
- 暂停时画面仍在，盖一层「已暂停分析」。
- 空态、权限拒绝（带恢复步骤）、加载骨架都在 `.frame-state`。
- 右侧：最新分析、缩略图、像素指标、记录列表、跳过帧说明、清除、底部追问命令栏。
- 持续模式应跳过低于变化阈值的帧。阈值默认 12%，在设置里可调。
- 停止后释放 tracks。浏览器结束共享时 UI 必须同步。

原型分析文案来自像素统计和脚本，不是视觉模型。Phase 6 才接真实分析。Phase 2 还原界面时，指标可以来自真实帧，模型结论必须标成未接入。

### 8.5 任务 `/tasks`

左列表 340px，右详情。不是看板。

筛选：全部、进行中、待确认、已完成、失败。可搜索。

| id            | 标题               | 原型状态             |
| ------------- | ------------------ | -------------------- |
| `t-mail`      | 把周报发给设计组长 | `wait`，高风险确认带 |
| `t-archive`   | 归档上周的设计稿   | `run`，进度约 0.4    |
| `t-minutes`   | 转写周五的站会录音 | `fail`，可重试       |
| `t-downloads` | 整理「下载」文件夹 | `done`               |
| `t-tray`      | 写入托盘菜单中文   | `done`               |
| `t-remind`    | 创建提醒 · 交周报  | `done`               |

详情：迷你 Core、目标、竖向步骤、确认带或结果。确认带区分 `warn` 与 `high`。步骤状态 `done` `run` `wait` `fail` `todo`。

这些任务在原型里不执行真实邮件、文件或托盘写入。导航角标默认读 `localStorage['aura-pending']`，缺省为 2。生产角标必须来自服务端待确认数。

前端只展示服务端状态，不自行推断成功。状态对齐契约：`queued` `planning` `waiting_confirmation` `running` `completed` `failed` `cancelled` `rejected`。原型用的 `wait/run/done/fail` 只是视觉别名，映射关系在 Phase 5 定，Phase 2 先按设计稿的视觉状态还原。

### 8.6 记忆 `/memory`

单列，最大宽度 920。分组：偏好 `pref`、资料 `profile`、最近学到 `learned`。

- 搜索、添加、行点击打开右侧 sheet。
- 每条可看、改、删、固定。固定项优先引用，且不受保留期限影响。
- 删除和清空需要确认。设置里「清空未固定」可撤销。
- 文案强调不会在后台悄悄写入。
- 原型种子 8 条，存在 `localStorage['aura-memories']`。生产数据走 Memory API，种子只做设计夹具。

### 8.7 设置 `/settings`

左侧 232px 导航 + 搜索。分组一次只显示一个；搜索时跨组过滤。九组：

| section      | 内容                                                                                     | Web 阶段注意                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 通用         | 登录启动、关闭窗口留在菜单栏、打开时进入、窗口样式、外观、语言、动效、核心画质、背景尘埃 | 外观只有深色且禁用。语言禁用。登录启动和菜单栏是桌面能力，Web 上控件保留视觉，但必须标成暂未开放，不能假装生效 |
| 模型         | 运行方式、默认对话模型、默认视觉模型、Ollama / OpenAI / Anthropic                        | 原型只存密钥末四位。生产密钥只进服务端加密存储，GET 不回明文                                                   |
| 语音         | 唤醒词默认关、麦克风、电平测试、STT、自动朗读、语速、声音、输出设备、试听                | 输出设备在浏览器里禁用。唤醒词保持关闭。Whisper 标成未接入                                                     |
| 摄像头与屏幕 | 默认设备、预览、间隔、变化阈值、记录保留、跳到视觉页                                     | 预览必须手动打开，离开即停                                                                                     |
| 隐私与权限   | 上传策略、统计关闭、权限状态、全部停止、导出、清除会话索引                               | 统计保持关闭。导出不得包含完整密钥                                                                             |
| 记忆         | 条数、对话后提议写入、保留期限、清空未固定                                               | 提议写入仍需用户确认                                                                                           |
| 快捷键       | 上表 8 条，可复制。原型声明不能改系统级快捷键                                            | Web 只实现页面内快捷键                                                                                         |
| 本地运行     | Ollama 地址与真实探测、GPU 名称、上下文长度、保活、自动拉起、当前模型、`/api/tags` 列表  | 「拉起 Ollama」在浏览器里只保存偏好，不启动进程                                                                |
| 关于         | 图标、Presence v2.0、设计系统、字体许可、依赖、恢复默认                                  | 版本号不要写成已发布的桌面应用                                                                                 |

模型菜单原型数据：

| id       | 名称            | 提供方    | 位置 | 能力                   |
| -------- | --------------- | --------- | ---- | ---------------------- |
| `local`  | Qwen2.5 7B      | Ollama    | 本地 | 文本、视觉、工具       |
| `gpt`    | GPT-4o          | OpenAI    | 云端 | 文本、视觉、语音、工具 |
| `claude` | Claude Sonnet 4 | Anthropic | 云端 | 文本、视觉、工具       |

开发文档要求：没有真实配置的提供方不能显示成可用。Phase 2 若要 100% 还原菜单外观，这三项作为设计夹具出现时，连接状态必须是「演示」或「未配置」，不能显示「已连接」除非探测成功。Ollama 的「测试连接」在原型里会真的请求用户填写的地址，这个行为可以保留。

## 9. 可复用评估

没有可复用的应用代码。可复用的是设计资产和交互规格。

| 资产                                                           | 处理                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `aura.css`                                                     | Phase 2 把 `:root` 提成全局 token。组件样式按类名移植，不整文件丢进生产并继续写选择器补丁  |
| `aura-core3d.js`                                               | 移植着色器、轨道、状态表和生命周期。用 React 包一层。不重写视觉                            |
| `icons.js`                                                     | 复制 sprite 到 `apps/web` 静态资源，或生成同名 Lucide 映射。不改路径                       |
| Geist woff2 + OFL                                              | 复制字体到 Web 静态资源。保留许可证                                                        |
| `logo/*.svg`                                                   | 复制产品用到的 SVG。`packaging/` 留在设计目录，桌面阶段再用                                |
| `home-capture.jpg`                                             | 仅设计夹具                                                                                 |
| `shell.js` `command.js`                                        | 行为规格：感知、确认框、焦点圈、Core 飞行、命令栏模式。不要把 DOM 命令式代码原样搬进 React |
| `home.js` 及各页脚本                                           | 对照交互和文案。其中的假 AI、假文件、假邮件不能进入生产路径                                |
| `app/*.js`                                                     | 构建产物。不移植                                                                           |
| `design-system.html`、`assets/aura-core.js`、`assets/aura.css` | v1。不移植                                                                                 |
| `AuraAi-web`                                                   | 空仓库。不复用                                                                             |

原型本地存储键，仅作行为参考：`aura-settings`、`aura-memories`、`aura-pending`、`aura-core-at`、`aura-nav-from`、`aura-booted`、`aura-ds-state`。生产设置和记忆走后端。主题、动效、窗口样式可以留在客户端。

## 10. 与开发文档的差异

按文档优先级：用户最新要求 > 设计稿 > 开发文档 > 自行推断。下面这些先记下来，Phase 1 不擅自改体验。

1. **设计路径。** 文档写 `design/`。实际在 `设计资源/AURA-AI/`。不移动源文件。
2. **桌面外壳出现在 Web 视觉里。** 标题栏、交通灯、Windows 控件、菜单栏、登录启动都在设计稿中。当前阶段不开发 Electron。建议 Web 完整画出这层外壳；交通灯保持不可操作；登录启动、关闭到菜单栏、拉起 Ollama 进程标为暂未开放。
3. **原型默认模型显示已连接。** 与「不得伪造可用 Provider」冲突。视觉还原用夹具时必须带演示标识，探测成功才显示已连接。
4. **主页可以完成一轮对话。** 文档把 `/conversations` 当作对话工作区。设计里主页阅读模式就是一轮会话，对话页是完整历史。两条都保留，不把主页改成跳转。
5. **任务视觉状态名和 API 状态名不同。** 见 8.5。Phase 2 用设计状态，Phase 5 再映射契约。
6. **记忆分类。** 设计是偏好 / 资料 / 最近学到。契约里的 `category` 是字符串，`status` 还有 `pending`。设计列表没有单独的待确认分组。待确认记忆的界面要在 Phase 7 前再对一次设计，不在 Phase 1 发明新页面。
7. **v1 `home.html` 缺失。** 不影响 v2 实现。不补画 v1。
8. **品牌说明与 CSS 的模糊半径。** 以 `aura.css` 的 26px + saturate(150%) 为准。

## 11. 缺失内容

工程侧全部缺失，留到对应阶段：

- pnpm workspace、React、Vite、NestJS、PostgreSQL、Drizzle
- 共享类型、API Client、Platform Adapter
- ESLint、Prettier、测试、Docker Compose、`.env.example`
- 鉴权、会话、模型、Agent、视觉、语音、记忆的真实实现

设计侧缺失或不进本阶段：

- `home.html`（v1，忽略）
- 浅色主题（设置写明以后再做，不用滤镜反色）
- 产品内没有独立登录页。MVP 鉴权按后端规范做，不新画一套登录视觉，除非后续补设计

## 12. 待确认

Phase 1 开始前只需要确认下面第 1 条。其余按本审计的建议执行，若有不同再改。

1. **工程根目录。** 已确认使用 `/Users/haopeixian/Desktop/Aura AI/AuraAi-web`。该目录原本是空 Git 仓库，Phase 1 在这里初始化 monorepo。
2. **设计目录。** 已确认继续以 `../设计资源/AURA-AI` 为只读基准，不复制进 `design/`。
3. **Phase 2 演示数据。** 建议用设计稿里的文案和会话做可关闭夹具，界面上能看出是演示，默认不冒充真实模型。

## 13. Phase 1 计划（待确认后执行）

### 目标

搭一个能启动、能检查的全栈骨架。不还原页面，不接模型，不建 Electron。

### 将创建的文件

根目录：

- `package.json`：pnpm 脚本 `dev` `lint` `typecheck` `test`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`（安装生成）
- `.gitignore`：`node_modules`、`dist`、`.env`、覆盖率
- `.env.example`：只放变量名和占位值，对齐架构文档第 7 节
- `docker-compose.yml`：PostgreSQL，库名与 `.env.example` 的 `DATABASE_URL` 一致
- `README.md`：如何安装、启动、看 health。写明设计基准路径和「当前没有 Electron」
- `tsconfig.base.json`（或 `packages/config`）

`apps/web`：

- Vite + React + TypeScript strict
- React Router 只放一个占位页，请求 `GET /api/v1/health` 并显示结果
- 不引入 Tailwind 主题成品、不移植 Core、不复制设计页面
- 开发端口 5173，代理或直接访问 API 3000

`apps/server`：

- NestJS + TypeScript strict
- `GET /api/v1/health` 返回状态、时间
- `GET /api/v1/health/ready` 检查数据库连通（数据库未启动时给出明确错误，不打印连接串密码）
- Pino、Helmet、CORS 白名单、请求体限制
- Drizzle 只建连接和一条空迁移或 health 所需的最小 schema，不建业务表
- Swagger 仅开发环境挂上，可以只有 health

`packages/shared-types`：

- `ApiError`、`Paginated`、health DTO。不提前铺全部业务 DTO

`packages/api-client`：

- `baseURL`、超时、错误解析、`AbortSignal`。Web 占位页通过它访问 health

`packages/platform`：

- 导出 `PlatformKind` 和 `PlatformAdapter` 接口
- Web 实现可以是空壳，方法在未调用时不申请媒体权限。Phase 1 不接摄像头

`packages/config`：

- 共享 ESLint、Prettier、TSConfig。仅在 web 与 server 都要用时才放这里

不创建：

- `apps/desktop`、Electron、IPC、托盘
- `packages/ui`（Phase 2 再看是否有共享价值）
- 业务模块：auth、chat、agent、vision、voice、memory
- 对 `设计资源/`、`开发文档/` 的任何修改
- Git 提交（除非另请要求）

### 依赖

安装时取当前互兼容的稳定版并锁 lockfile。预期包括：React、Vite、TypeScript、React Router、NestJS、Drizzle、`pg`、Zod、Pino、Vitest。  
Phase 1 不安装 Three、Motion、Tailwind、Electron。

### 风险

- 本机没有 pnpm 或 Docker 时，安装和数据库就绪检查会失败。失败就停，不改成 SQLite 蒙混。
- `AuraAi-web/.git` 与根目录未来的 Git 可能嵌套。Phase 1 不初始化根 Git，避免和这个空仓库缠在一起。
- Nest 与 Vite 的端口、CORS 必须和 `.env.example` 一致，否则占位页访问 health 会失败。

### 验收

- `pnpm install` 成功
- `pnpm dev` 同时启动 Web 与 Server
- 浏览器打开 Web，能看到 Server health 的真实结果
- `GET /api/v1/health` 返回正常 JSON
- 数据库可用时 migration 命令能执行；不可用时错误指出缺少什么
- `pnpm lint`、`pnpm typecheck`、`pnpm test` 可运行
- 依赖里没有 `electron`
- `设计资源/AURA-AI` 与 `开发文档` 无 diff

### 完成报告

Phase 1 结束后按开发文档模板写：已完成项、文件清单、技术决策、执行过的命令、测试结果、未完成项、下一阶段建议。通过后再进入 Phase 2 设计系统与页面还原。
