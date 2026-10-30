# 黑雾城邦 Misthold

P0 垂直切片：微内核插件架构的 RTS + 塔防 + 经营 Web 游戏（TypeScript / Vite / PixiJS / React）。

## 运行

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

## 测试

```bash
pnpm test         # 53 个单元测试（kernel 31 / sim 10 / game 12）
pnpm typecheck    # 5 个包全部 tsc --noEmit
```

## 结构

| 包 | 职责 |
|---|---|
| `packages/kernel` | 微内核：生命周期 / EventBus / ServiceLocator / Scheduler / ConfigStore（零游戏依赖） |
| `packages/sim` | 权威游戏状态（single source of truth） |
| `packages/render` | PixiJS 只读投影层 |
| `packages/ui` | React HUD + zustand |
| `packages/game` | 组装 + 演示闭环 + Vite 入口 |

架构铁律：UI/render 只读 sim，所有变更经 Command 事件流入；配置加载后深冻结。

## 验证工具

- `tools/smoke_headless.py` — Playwright 全周期冒烟（筹备→预警→入侵→清算）
- `tools/smoke_interact.py` — 交互验证（建塔/暂停/fps）
- `tools/process_art.py` — 美术资产管线

## 当前状态

P0 功能闭环完成：53 测试全绿、typecheck 0 错、浏览器双验证通过。
待办见 `.workbuddy/memory/MEMORY.md`（霜冻塔减速 / Flow Field 寻路 / UI 图集 / 电力系统）。

美术资产来自 Kenney（CC0）与程序化生成，见 `docs/asset-credits.md`。
