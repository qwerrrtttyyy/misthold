# 黑雾城邦 Misthold · 交接件

## 【主线状态】

**当前节点**: P0 垂直切片功能闭环已完成并通过沙箱双验证 (全周期 + 交互), 处于「用户真机验收前」状态。

**技术栈**: TS 7.0.2 / Vite 8.3.5 / Vitest 5.0.5 / PixiJS 8.22 / React 19.3 / zustand 5 / pnpm workspace (5 包: kernel/sim/render/ui/game)。**无降级**。

**五包结构**: kernel (机制, 31 测试) / sim (权威状态, 10 测试) / render (Pixi 只读投影) / ui (React HUD + zustand) / game (组装 + demo-sim 演示闭环, 12 测试)。

**关键路径**:
- 入口: `packages/game/src/main.ts` (组装) · 演示闭环: `packages/game/src/modules/demo-sim.ts`
- 数据平衡: `data/demo.json` (改平衡不动代码)
- 美术管线: `tools/process_art.py` → `assets/` (264 项 manifest, 261 PNG)
- 验证: `tools/smoke_headless.py` (全周期) / `tools/smoke_interact.py` (交互+fps)
- 文档: `docs/d1-smoke-report.md` (兼容性) / `docs/asset-credits.md` (CC0) / `docs/asset-preview.png` (视觉联络图)

**下一步 (按优先级)**:
1. 用户 Android 真机验收 (技术文档 §5): `pnpm dev` → LAN 访问 :5173, 验触屏手势/建塔/fps。
2. 性能基线 (准则 #5): 200 单位同屏基准测试 (现 demo ~10-20 实体)。
3. backlog 项见 `.workbuddy/memory/MEMORY.md` (霜冻塔减速 / Flow Field / UI 图集 / 电力接入)。

## 【本session】2026-10-25

**做了什么**:
1. 诊断并关闭 headless boot 挂起 (virtual-time-budget 伪影, 非代码 bug); 改用 Playwright 真实时间验证体系。
2. 修复 manifest id 撞车 (82 UI 变体被静默去重); 管线加唯一性 FATAL 校验。
3. 实现交互建造链路全链 (选卡/ghost/点击/验证/扣费/告警), 补齐验收准则 #2 的「建塔/暂停布防」。
4. 修复存量 bug: CycleBar 暂停/速度按钮未经总线 (装饰品); ConfigStore 配置可被模块改写 (深拷贝+深冻结); canvas 不响应式 (resizeTo: window)。
5. 测试 39→53 (game 包新建 vitest + 12 放置用例; kernel +2 配置不可变用例); typecheck 5 包 0 错。
6. 文档: asset-credits / d1-smoke-report / 记忆三件套。

**卡点**: 沙箱无 GPU (SwiftShader 软渲染 60fps 为参考值); 真机触控与帧率待用户验收。

**未决**: 无阻塞项。范围冻结纪律有效——所有新想法进 backlog, 未动切片代码。
