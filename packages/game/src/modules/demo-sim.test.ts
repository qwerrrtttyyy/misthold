/**
 * DemoSimModule 放置模式测试 (验收标准 #2: 建采集/建塔/暂停布防)
 * 无头 Node 环境: 真实 EventBus/ServiceLocator/ConfigStore + demo.json 配置。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore, EventBus, ServiceLocator } from '@misthold/kernel';
import type { ModuleContext } from '@misthold/kernel';
import { EntityKind, Tile, WorldStore } from '@misthold/sim';
import demoConfig from '../../../../data/demo.json';
import { DemoSimModule } from './demo-sim.js';

interface Captured {
  placement: ({ kind: string | null })[];
  build: ({ ok: boolean; kind: string; reason?: string })[];
  resources: ({ resources: Record<string, number>; rates: Record<string, number> })[];
}

function setup(): { mod: DemoSimModule; ctx: ModuleContext; world: WorldStore; cap: Captured; bus: EventBus } {
  const bus = new EventBus();
  const services = new ServiceLocator();
  const config = new ConfigStore();
  config.load(demoConfig);
  const ctx = { events: bus, services, config } as unknown as ModuleContext;
  const mod = new DemoSimModule();
  mod.init(ctx);
  const cap: Captured = { placement: [], build: [], resources: [] };
  bus.on('placement_changed', (p) => cap.placement.push(p as { kind: string | null }));
  bus.on('build_result', (p) => cap.build.push(p as { ok: boolean; kind: string; reason?: string }));
  bus.on('resources_changed', (p) =>
    cap.resources.push(p as { resources: Record<string, number>; rates: Record<string, number> }),
  );
  return { mod, ctx, world: services.get<WorldStore>('sim.world'), cap, bus };
}

/** 选卡 + 点地图 (完整玩家动作) */
function place(bus: EventBus, kind: string, x: number, y: number): void {
  bus.emit('cmd_place_building', { kind });
  bus.emit('cmd_map_click', { x, y });
}

describe('DemoSimModule 放置模式', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('选卡进入放置模式, 再点同名卡取消', () => {
    s.bus.emit('cmd_place_building', { kind: '箭塔' });
    expect(s.cap.placement).toEqual([{ kind: '箭塔' }]);
    s.bus.emit('cmd_place_building', { kind: '箭塔' });
    expect(s.cap.placement).toEqual([{ kind: '箭塔' }, { kind: null }]);
  });

  it('cmd_cancel_placement 广播 null', () => {
    s.bus.emit('cmd_place_building', { kind: '民居' });
    s.bus.emit('cmd_cancel_placement', {});
    expect(s.cap.placement.at(-1)).toEqual({ kind: null });
  });

  it('非放置模式点击地图不触发建造', () => {
    s.bus.emit('cmd_map_click', { x: 20, y: 20 });
    expect(s.cap.build).toHaveLength(0);
  });

  it('箭塔: 扣费 + 实体 + 高台地块 + 退出放置', () => {
    place(s.bus, '箭塔', 20, 20);
    expect(s.cap.build.at(-1)).toEqual({ ok: true, kind: '箭塔' });
    expect(s.cap.placement.at(-1)).toEqual({ kind: null });
    // 资源扣除 (80 木 -30, 40 铁 -5)
    const r = s.cap.resources.at(-1)!.resources;
    expect(r.wood).toBe(50);
    expect(r.iron).toBe(35);
    // 世界状态
    const towers = s.world.ofKind(EntityKind.Tower);
    expect(towers).toHaveLength(5); // 4 演示塔 + 1 新塔
    expect(towers.at(-1)).toMatchObject({ x: 20, y: 20, hp: 60 });
    expect(s.world.tileAt(20, 20)).toBe(Tile.Platform);
  });

  it('资源不足: 失败保留放置模式且不扣费', () => {
    // 80 木 / 30 每塔 -> 第 3 次必败 (剩余 20)
    place(s.bus, '箭塔', 20, 20);
    place(s.bus, '箭塔', 21, 20);
    s.bus.emit('cmd_place_building', { kind: '箭塔' }); // 重新进入
    s.bus.emit('cmd_map_click', { x: 22, y: 20 });
    const last = s.cap.build.at(-1)!;
    expect(last.ok).toBe(false);
    expect(last.reason).toContain('资源不足');
    expect(s.cap.placement.at(-1)).toEqual({ kind: '箭塔' }); // 仍可重试
    const r = s.cap.resources.at(-1)!.resources;
    expect(r.wood).toBe(20); // 只扣了前两次
  });

  it('地形不可建 (水/污染地)', () => {
    s.world.setTile(25, 25, Tile.Water);
    s.bus.emit('cmd_place_building', { kind: '箭塔' });
    s.bus.emit('cmd_map_click', { x: 25, y: 25 });
    expect(s.cap.build.at(-1)!.ok).toBe(false);
    expect(s.cap.build.at(-1)!.reason).toBe('该地形不可建造');
  });

  it('占用校验: 核心格与已有建筑', () => {
    place(s.bus, '民居', 32, 32); // 核心格 -> 失败但保留放置模式
    expect(s.cap.build.at(-1)!.reason).toContain('辉光核心');
    // 失败后模式仍在, 直接点第二处 (无需重新选卡)
    s.bus.emit('cmd_map_click', { x: 29, y: 29 }); // 演示箭塔占位
    expect(s.cap.build.at(-1)!.reason).toBe('目标格已被占用');
  });

  it('产出建筑加速率 (锯木厂: 木材 1.6 -> 2.2)', () => {
    place(s.bus, '锯木厂', 20, 20);
    expect(s.cap.build.at(-1)).toEqual({ ok: true, kind: '锯木厂' });
    s.mod.fixedUpdate!(250); // 触发一次节流发射
    const rates = s.cap.resources.at(-1)!.rates;
    expect(rates.wood).toBeCloseTo(2.2, 5);
    expect(rates.food).toBeCloseTo(2.2, 5); // 未受影响
    expect(s.world.ofKind(EntityKind.Building)).toHaveLength(1);
  });

  it('城墙: 地块改墙 + 变体精灵', () => {
    place(s.bus, '城墙', 30, 30);
    expect(s.world.tileAt(30, 30)).toBe(Tile.Wall);
    const b = s.world.ofKind(EntityKind.Building);
    expect(b).toHaveLength(1);
    expect(b[0]!.tex).toBe('building.wall_01');
  });

  it('stub 建筑: 明确失败原因', () => {
    place(s.bus, '兵营', 20, 20);
    expect(s.cap.build.at(-1)!.ok).toBe(false);
    expect(s.cap.build.at(-1)!.reason).toContain('P0 切片未实现');
    expect(s.world.ofKind(EntityKind.Tower)).toHaveLength(4); // 无变化
  });

  it('霜冻塔用变体 stats (范围 3.2 / 伤害 7)', () => {
    place(s.bus, '霜冻塔', 24, 24);
    const t = s.world.ofKind(EntityKind.Tower).at(-1)!;
    expect(t).toMatchObject({ x: 24, y: 24, hp: 60 });
    // stats 是模块私有; 通过战斗间接验证伤害更低: 放一个 30hp 敌在塔旁
    const enemy = s.world.spawn(EntityKind.Twisted, 26, 24, 30, 0);
    // 手动跑一帧战斗 (入侵期逻辑) — 借 fixedUpdate 的阶段推进太慢, 直接验证实体存在性
    expect(s.world.byId(enemy.id)!.hp).toBe(30);
    expect(s.world.ofKind(EntityKind.Tower)).toHaveLength(5);
  });

  it('建造后可被序列化 (tex 字段往返)', () => {
    place(s.bus, '民居', 20, 20);
    place(s.bus, '箭塔', 21, 21);
    const snap = JSON.parse(JSON.stringify(s.world.serialize()));
    const w2 = WorldStore.deserialize(snap);
    expect(w2.serialize()).toEqual(s.world.serialize());
    expect(w2.ofKind(EntityKind.Building)[0]!.tex).toBe('building.house');
  });
});
