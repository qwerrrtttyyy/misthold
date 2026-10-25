# 黑雾城邦 Misthold · 项目记忆

> 微内核插件架构 RTS+塔防+经营切片 (技术文档 v1.0)。本文件只沉淀跨 session 可复用条目。

## 架构铁律 (违反 = 返工)

- **单向数据流**: 输入/UI → Command 事件 → sim (唯一权威) → EventBus → render/ui 只读投影。render 永不改 sim, 反向只发 cmd_* 事件。
- **sim 是唯一权威**: 连"放置模式"这种 UI 态也由 sim 持有并广播 (`placement_changed`), UI/render 纯投影。
- **配置是静态数据**: `ConfigStore.load` 深拷贝+深冻结; 模块误写配置直接抛错。运行时状态 (资源存量/速率加成) 放模块私有字段, 永不改写 cfg。
- **内核零游戏依赖**: kernel 只提供机制 (生命周期/拓扑/EventBus/ServiceLocator/Scheduler/ConfigStore), 不认识任何游戏概念。
- **定步长 60Hz**: sim 走 fixedUpdate (掉帧最多补 5 步), 表现走 update (暂停仍渲染)。

## 技术栈结论 (2026-10-24 D1 冒烟, 详见 docs/d1-smoke-report.md)

- TS 7.0.2 / Vite 8.3.5 / Vitest 5.0.5 / PixiJS 8.22 / React 19.3 / zustand 5 / pnpm workspace —— **全部直接可用, 无需降级**。
- TS7 `verbatimModuleSyntax`: 类型导入必须 `import type` 拆分。
- @types/react-dom 锁 19.3.0 (19.3.1 不存在)。

## 环境/工作流坑

- **art:process 后必须重启 dev server**: `process_art.py` rmtree 全删重建 assets/, vite sirv publicDir 缓存陈化 → 资产请求落 SPA fallback 返回 index.html (表现为 boot 卡住)。
- **headless 验证禁用 `--virtual-time-budget`**: 261 PNG 并发加载跑不完虚拟预算, boot 链被截断 (假挂起)。用 Playwright 真实时间驱动 (`tools/smoke_headless.py` / `smoke_interact.py`)。
- **Pixi resizeTo: window**: 不加则 inline style 把画布钉死在初始 800x600, 手机溢出。
- **pkill -f vite 会误杀含 "vite" 字样的自身 shell**: 用 pgrep 精确 PID。
- Edit 工具并行编辑同一文件会冲突: 同文件的多个编辑串行发送。

## 美术资产 (docs/asset-credits.md)

- 管线 `tools/process_art.py` → 264 manifest 项 / 261 PNG (2MB)。Kenney CC0 4 包 + 程序化自产。
- **manifest id 唯一性**: id 含变体目录 (`ui.Default.*` vs `ui.Double.*`); 写出前全局校验, 撞车即 FATAL。
- 双雾/辉光核心/建筑/UI 重染均为自产; TD tilesheet @2x 原生 128px 1:1 直切。
- 视觉验收联络图: `docs/asset-preview.png`。

## 当前状态 (2026-10-25)

- 53 测试全绿 (kernel 31 / sim 10 / game 12), 5 包 typecheck 0 错。
- 浏览器双验证 PASS: 全周期闭环 (smoke_headless) + 交互建塔/暂停/fps (smoke_interact)。
- 交互建造链路已通: 选卡→ghost 预览 (绿/红可建性)→点击放置→扣费→实体→告警。
- 预览: dev server `pnpm dev` → http://localhost:5173/ (host:true 手机可 LAN 访问)。

## 待办 backlog (范围冻结纪律: 不动切片代码)

- 霜冻塔减速效果 (现为变体 stats, 无 slow 字段)。
- Flow Field 寻路 (现敌人直线攻核心; 城墙尚不阻敌)。
- UI 图集合并 (261 PNG → 雪碧图, 低端机首载)。
- 电力系统接入建造 (现 gen/use 静态展示)。
- 正式版: city-kit 两 3D 包启用评估; 末世气质字体替换 Kenney Future。
