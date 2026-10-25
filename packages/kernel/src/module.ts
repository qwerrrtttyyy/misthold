/**
 * Kernel 模块契约 (技术文档 §3.3)
 * 内核只提供机制, 不提供策略: 不认识任何游戏概念。
 */
import type { EventBus } from './events.js';
import type { ServiceLocator } from './services.js';
import type { ConfigStore } from './config.js';

/** 跨模块通信 + 服务查找 + 配置视图, 由 Kernel 在 boot 时注入 */
export interface ModuleContext {
  events: EventBus;
  services: ServiceLocator;
  config: ConfigStore;
}

/** 功能模块契约: 任何功能域(城市/战斗/黑雾/渲染/UI)都是插件 */
export interface GameModule {
  readonly id: string;
  /** 依赖拓扑排序的依据 (技术文档 §3.1-6) */
  readonly deps?: readonly string[];
  /** 异步初始化 (渲染层 Pixi 异步 init 走这里) */
  init(ctx: ModuleContext): void | Promise<void>;
  /** 全部模块 init 完成后调用 */
  start?(): void;
  /** 渲染帧率调用 (表现层用, dt 可变) */
  update?(dtMs: number): void;
  /** 固定 60Hz 调用 (模拟层用) */
  fixedUpdate?(stepMs: number): void;
  dispose?(): void;
}
