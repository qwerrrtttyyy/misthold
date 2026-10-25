/**
 * Kernel: 加载器内核 (技术文档 §3.3)
 * 职责: 生命周期 / 拓扑加载 / EventBus / ServiceLocator / Scheduler / ConfigStore
 * 纪律: 内核零游戏依赖, 不认识任何游戏概念。
 */
import { ConfigStore } from './config.js';
import { EventBus } from './events.js';
import type { GameModule, ModuleContext } from './module.js';
import { Scheduler } from './scheduler.js';
import { ServiceLocator } from './services.js';

export class Kernel {
  readonly events = new EventBus();
  readonly services = new ServiceLocator();
  readonly config = new ConfigStore();
  readonly scheduler = new Scheduler();

  private readonly modules = new Map<string, GameModule>();
  private order: GameModule[] = [];
  private booted = false;

  /** 注册模块 (重复 id = 装配错误) */
  register(mod: GameModule): this {
    if (this.modules.has(mod.id)) {
      throw new Error(`[Kernel] duplicate module id: ${mod.id}`);
    }
    this.modules.set(mod.id, mod);
    return this;
  }

  /** boot: 拓扑排序 -> 逐个 init -> 全部 start; 返回加载顺序 (演示/测试用) */
  async boot(): Promise<readonly string[]> {
    if (this.booted) throw new Error('[Kernel] already booted');
    this.order = this.topologicalSort();
    const ctx: ModuleContext = {
      events: this.events,
      services: this.services,
      config: this.config,
    };
    for (const mod of this.order) {
      await mod.init(ctx);
      this.scheduler.add(mod);
    }
    for (const mod of this.order) mod.start?.();
    this.booted = true;
    return this.order.map((m) => m.id);
  }

  async dispose(): Promise<void> {
    this.scheduler.stop();
    for (const mod of [...this.order].reverse()) mod.dispose?.();
    this.order = [];
    this.modules.clear();
    this.booted = false;
  }

  get<T extends GameModule>(id: string): T {
    const mod = this.modules.get(id);
    if (!mod) throw new Error(`[Kernel] module not found: ${id}`);
    return mod as T;
  }

  /** 依赖拓扑排序: 稳定 (注册序为 tie-break), 缺失依赖/环直接抛错 */
  private topologicalSort(): GameModule[] {
    const sorted: GameModule[] = [];
    const visited = new Map<string, 1 | 2>(); // 1=访问中 2=完成

    const visit = (mod: GameModule, chain: string[]): void => {
      const state = visited.get(mod.id);
      if (state === 2) return;
      if (state === 1) {
        throw new Error(`[Kernel] dependency cycle: ${[...chain, mod.id].join(' -> ')}`);
      }
      visited.set(mod.id, 1);
      for (const dep of mod.deps ?? []) {
        const depMod = this.modules.get(dep);
        if (!depMod) {
          throw new Error(`[Kernel] module "${mod.id}" missing dependency: "${dep}"`);
        }
        visit(depMod, [...chain, mod.id]);
      }
      visited.set(mod.id, 2);
      sorted.push(mod);
    };

    for (const mod of this.modules.values()) visit(mod, []);
    return sorted;
  }
}
