import { describe, expect, it, vi } from 'vitest';
import { Kernel } from './kernel.js';
import { ConfigStore } from './config.js';
import { EventBus } from './events.js';
import { Scheduler, FIXED_STEP_MS } from './scheduler.js';
import { ServiceLocator } from './services.js';
import type { GameModule, ModuleContext } from './module.js';

// ---- 测试辅助 ----
function stubModule(id: string, deps?: string[]): GameModule & { log: string[] } {
  const log: string[] = [];
  return {
    id,
    deps,
    log,
    init(ctx: ModuleContext) {
      log.push(`init:${id}`);
      // 契约检查: ctx 三件套在场
      if (!ctx.events || !ctx.services || !ctx.config) throw new Error('ctx incomplete');
    },
    start() {
      log.push(`start:${id}`);
    },
    fixedUpdate() {
      log.push(`fixed:${id}`);
    },
    update() {
      log.push(`update:${id}`);
    },
    dispose() {
      log.push(`dispose:${id}`);
    },
  };
}

describe('EventBus', () => {
  it('on/emit 送达 payload', () => {
    const bus = new EventBus<{ ping: { n: number } }>();
    const seen: number[] = [];
    bus.on('ping', (p) => seen.push(p.n));
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(seen).toEqual([1, 2]);
  });

  it('off 后不再送达', () => {
    const bus = new EventBus<{ ping: number }>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('once 只触发一次', () => {
    const bus = new EventBus<{ ping: number }>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', 1);
    bus.emit('ping', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('无监听者 emit 不抛错', () => {
    const bus = new EventBus<{ ping: number }>();
    expect(() => bus.emit('ping', 1)).not.toThrow();
  });

  it('单个监听器抛错不影响其他监听器', () => {
    const bus = new EventBus<{ ping: number }>();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', good);
    bus.emit('ping', 1);
    expect(good).toHaveBeenCalledWith(1);
    errSpy.mockRestore();
  });

  it('emit 中 off 其他监听者安全 (复制监听集)', () => {
    const bus = new EventBus<{ ping: number }>();
    const second = vi.fn();
    bus.on('ping', () => bus.off('ping', second));
    bus.on('ping', second);
    bus.emit('ping', 1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe('ServiceLocator', () => {
  it('register/get/has 基本流', () => {
    const loc = new ServiceLocator();
    const renderer = { draw: () => {} };
    loc.register('platform.renderer', renderer);
    expect(loc.has('platform.renderer')).toBe(true);
    expect(loc.get('platform.renderer')).toBe(renderer);
  });

  it('get 未注册服务抛错', () => {
    const loc = new ServiceLocator();
    expect(() => loc.get('nope')).toThrow(/not found/);
  });

  it('重复注册抛错 (装配错误不静默)', () => {
    const loc = new ServiceLocator();
    loc.register('x', 1);
    expect(() => loc.register('x', 2)).toThrow(/duplicate/);
  });
});

describe('ConfigStore', () => {
  it('点号路径读取嵌套配置', () => {
    const cfg = new ConfigStore();
    cfg.load({ towers: { arrow: { damage: 12, range: 160 } } });
    expect(cfg.get<number>('towers.arrow.damage')).toBe(12);
    expect(cfg.get('towers.arrow.missing')).toBeUndefined();
  });

  it('require 缺失配置抛错', () => {
    const cfg = new ConfigStore();
    expect(() => cfg.require('a.b.c')).toThrow(/missing required/);
  });

  it('prefix 合并多来源配置', () => {
    const cfg = new ConfigStore();
    cfg.load({ damage: 1 }, 'towers.arrow');
    cfg.load({ damage: 2 }, 'towers.cannon');
    expect(cfg.get<number>('towers.arrow.damage')).toBe(1);
    expect(cfg.get<number>('towers.cannon.damage')).toBe(2);
  });

  it('load 深拷贝: 调用方改原对象不污染 store', () => {
    const cfg = new ConfigStore();
    const src = { nested: { hp: 100 } };
    cfg.load(src);
    src.nested.hp = 1; // 调用方后续修改
    expect(cfg.get<number>('nested.hp')).toBe(100);
  });

  it('require 返回的引用改写会抛错 (配置深冻结, 静态数据)', () => {
    const cfg = new ConfigStore();
    cfg.load({ res: { wood: 80 } });
    const got = cfg.require<{ wood: number }>('res');
    // 模块若把配置当运行时状态改写, 立即抛错而不是静默腐蚀共享状态
    expect(() => {
      got.wood -= 30;
    }).toThrow();
    expect(cfg.get<number>('res.wood')).toBe(80);
    const fresh = new ConfigStore();
    fresh.load(cfg.snapshot());
    expect(fresh.get<number>('res.wood')).toBe(80);
  });
});

describe('Scheduler', () => {
  const mkMod = () => {
    const m = { fixed: 0, updates: 0, lastDt: 0, fixedUpdate(s: number) { m.fixed++; void s; }, update(dt: number) { m.updates++; m.lastDt = dt; } };
    return m;
  };

  it('16.67ms 一帧 -> 1 次 fixedUpdate', () => {
    const s = new Scheduler();
    const m = mkMod();
    s.add(m as never);
    s.tick(0);
    s.tick(FIXED_STEP_MS + 0.5);
    expect(m.fixed).toBe(1);
    expect(m.updates).toBe(1);
  });

  it('50ms 一帧 -> 3 次 fixedUpdate', () => {
    const s = new Scheduler();
    const m = mkMod();
    s.add(m as never);
    s.tick(0);
    s.tick(50.5); // 避开 3*FIXED_STEP_MS 的浮点边界
    expect(m.fixed).toBe(3);
  });

  it('长帧最多补 5 步 (死亡螺旋保护)', () => {
    const s = new Scheduler();
    const m = mkMod();
    s.add(m as never);
    s.tick(0);
    s.tick(1000);
    expect(m.fixed).toBe(5);
  });

  it('暂停: fixedUpdate 停, update 继续 (停 stepping 不停 rendering)', () => {
    const s = new Scheduler();
    const m = mkMod();
    s.add(m as never);
    s.setPaused(true);
    s.tick(0);
    s.tick(100);
    expect(m.fixed).toBe(0);
    expect(m.updates).toBe(1);
    expect(m.lastDt).toBe(100);
  });

  it('timeScale 2x -> 双倍步数', () => {
    const s1 = new Scheduler();
    const m1 = mkMod();
    s1.add(m1 as never);
    s1.tick(0);
    s1.tick(25.5); // 1x: 25.5ms -> 1 步
    expect(m1.fixed).toBe(1);

    const s2 = new Scheduler();
    const m2 = mkMod();
    s2.add(m2 as never);
    s2.setTimeScale(2);
    s2.tick(0);
    s2.tick(25.5); // 2x: 51ms -> 3 步
    expect(m2.fixed).toBe(3);
  });

  it('timeScale 被限制在 0.1-10', () => {
    const s = new Scheduler();
    s.setTimeScale(100);
    expect(s.timeScale).toBe(10);
    s.setTimeScale(0);
    expect(s.timeScale).toBe(0.1);
  });

  it('remove 后不再收到回调', () => {
    const s = new Scheduler();
    const m = mkMod();
    s.add(m as never);
    s.remove(m as never);
    s.tick(0);
    s.tick(50);
    expect(m.fixed).toBe(0);
    expect(m.updates).toBe(0);
  });

  it('reset 清空累积时间', () => {
    const s = new Scheduler();
    const m = mkMod();
    s.add(m as never);
    s.tick(0);
    s.tick(50);
    m.fixed = 0;
    s.reset();
    s.tick(100); // reset 后首帧重新初始化 last
    s.tick(200); // dt=100 -> 补满 5 步
    expect(m.fixed).toBe(5);
  });
});

describe('Kernel 拓扑加载', () => {
  it('按 deps 顺序 init/start, dispose 逆序', async () => {
    const k = new Kernel();
    const a = stubModule('a');
    const b = stubModule('b', ['a']);
    const c = stubModule('c', ['b']);
    k.register(c).register(b).register(a); // 故意乱序注册
    const order = await k.boot();
    expect(order).toEqual(['a', 'b', 'c']);
    expect(a.log).toEqual(['init:a', 'start:a']);
    expect(c.log).toEqual(['init:c', 'start:c']);
    await k.dispose();
    expect(c.log).toEqual(['init:c', 'start:c', 'dispose:c']);
    expect(a.log).toEqual(['init:a', 'start:a', 'dispose:a']);
  });

  it('缺失依赖抛错', async () => {
    const k = new Kernel();
    k.register(stubModule('a', ['ghost']));
    await expect(k.boot()).rejects.toThrow(/missing dependency/);
  });

  it('依赖环抛错', async () => {
    const k = new Kernel();
    k.register(stubModule('a', ['b']));
    k.register(stubModule('b', ['a']));
    await expect(k.boot()).rejects.toThrow(/cycle/);
  });

  it('重复 module id 抛错', () => {
    const k = new Kernel();
    k.register(stubModule('a'));
    expect(() => k.register(stubModule('a'))).toThrow(/duplicate/);
  });

  it('重复 boot 抛错', async () => {
    const k = new Kernel();
    k.register(stubModule('a'));
    await k.boot();
    await expect(k.boot()).rejects.toThrow(/already booted/);
  });

  it('init 抛错时 boot 失败 (fail-fast)', async () => {
    const k = new Kernel();
    const bad: GameModule = {
      id: 'bad',
      init() {
        throw new Error('init failed');
      },
    };
    k.register(bad);
    await expect(k.boot()).rejects.toThrow('init failed');
  });

  it('异步 init 被 await', async () => {
    const k = new Kernel();
    let done = false;
    k.register({
      id: 'async',
      async init() {
        await new Promise((r) => setTimeout(r, 10));
        done = true;
      },
    });
    await k.boot();
    expect(done).toBe(true);
  });

  it('boot 后模块经 scheduler 收到 fixedUpdate', async () => {
    const k = new Kernel();
    const m = stubModule('m');
    k.register(m);
    await k.boot();
    k.scheduler.tick(0);
    k.scheduler.tick(FIXED_STEP_MS + 0.5);
    expect(m.log).toContain('fixed:m');
    await k.dispose();
  });

  it('Kernel.get 返回已注册模块', async () => {
    const k = new Kernel();
    const m = stubModule('m');
    k.register(m);
    await k.boot();
    expect(k.get('m')).toBe(m);
    expect(() => k.get('nope')).toThrow(/not found/);
  });
});
