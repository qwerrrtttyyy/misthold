# D1 冒烟测试报告 · 三大新 major 兼容性结论

> 技术文档 §4 D1 退出条件: "手机可打开 hello 页面 + 重点验证 Vite 8 / TS 7 / Vitest 5 兼容性, 有坑当日降级"。
> 实测日期: 2026-10-24 · 环境: 沙箱 Linux / Node 22.13 / pnpm workspace。

## 结论: 三个新 major **全部可用, 无需降级**

| 组件 | 版本 | 结论 | 实测证据 |
| --- | --- | --- | --- |
| TypeScript | 7.0.2 | ✅ 直接可用 | strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` 全开, 5 包 tsc 0 错; 遇 2 个新严格度坑 (见下), 均为代码问题非编译器 bug |
| Vite | 8.3.5 | ✅ 直接可用 | dev server / HMR / publicDir / JSON 导入 / workspace 内部包源码消费全部正常; `resizeTo` 响应式画布验证通过 |
| Vitest | 5.0.5 | ✅ 直接可用 | node 环境 53 用例全绿 (kernel 31 / sim 10 / game 12); 并发跑包无串扰 |

## 遇到的坑与处置 (均非阻塞)

1. **TS7 `verbatimModuleSyntax` 更严格**: 类型当值导入直接报错 (sim/world-store.ts)。
   处置: 拆分为 `import { EntityKind, Tile }` + `import type { Entity, WorldSnapshot }`。属新规范的预期行为。
2. **@types/react-dom 19.3.1 不存在**: registry 实际最新为 19.3.0。
   处置: 锁 19.3.0 (非 TS7 问题, 是类型包发布节奏)。
3. **JSX 误写 .ts 文件** (UiModule.ts): TS7 报 TS1005 语法错误。
   处置: 改用 `createElement(App)` (UI 包不配 JSX transform, 保持纯净)。
4. **Vite publicDir 缓存**: `assets/` 全删重建 (art:process) 后 sirv 缓存陈化,
   资产请求落入 SPA fallback 返回 index.html。
   处置: 重跑美术管线后重启 dev server (已在 `process_art.py` 主流程加注释警示)。
   建议正式版: 资产目录纳入构建产物而非 publicDir 热更新。

## 验证矩阵

| 验证项 | 工具 | 结果 |
| --- | --- | --- |
| 类型检查 (5 包) | `pnpm typecheck` | 0 error |
| 单元测试 (3 包) | `pnpm test` | 53/53 passed |
| boot 链 + 全周期闭环 | `tools/smoke_headless.py` (Playwright) | PASS (筹备→预警→入侵→清算→第 2 日) |
| 交互建塔 + 暂停 + fps | `tools/smoke_interact.py` | PASS (塔 4→5, 木 -30, 暂停冻结, 60fps*) |
| 资源静态服务 | curl | manifest 264 项 / 261 PNG 全 200 |

\* 沙箱无 GPU, SwiftShader 软渲染下的 60fps; 真机数据以用户验收为准 (技术文档 §5 协作模型)。

## 遗留风险

- Vitest 5 与 TS7 的组合在 watch 模式未测 (CI 只用 run 模式)。
- Vite 8 的 `publicDir` + 大量小文件 (261 PNG) 在低端手机的首次加载未测;
  正式版应做雪碧图/图集 (TD tilesheet 已是图集, UI 待合并)。
