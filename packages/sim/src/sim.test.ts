import { describe, expect, it } from 'vitest';
import { Rng, mulberry32, xmur3 } from './prng.js';
import { WorldStore } from './world-store.js';
import { EntityKind, Tile } from './types.js';

describe('PRNG', () => {
  it('同种子同序列 (可复现, GDD §6.2)', () => {
    const a = new Rng('misthold-seed-1');
    const b = new Rng('misthold-seed-1');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同种子不同序列', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next 落在 [0,1)', () => {
    const r = new Rng(42);
    for (let i = 0; i < 500; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int 闭区间且分布覆盖两端', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('pick 不越界, chance 概率正确', () => {
    const r = new Rng(9);
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
    let hits = 0;
    for (let i = 0; i < 1000; i++) if (r.chance(0.3)) hits++;
    expect(hits).toBeGreaterThan(200);
    expect(hits).toBeLessThan(400);
  });

  it('mulberry32/xmur3 底层函数直接可用', () => {
    expect(typeof mulberry32(1)).toBe('function');
    expect(xmur3('abc')()).toBeGreaterThanOrEqual(0);
  });
});

describe('WorldStore', () => {
  it('tile 读写与越界默认墙', () => {
    const w = new WorldStore();
    w.setTile(10, 20, Tile.Forest);
    expect(w.tileAt(10, 20)).toBe(Tile.Forest);
    expect(w.tileAt(-1, 0)).toBe(Tile.Wall);
    expect(w.tileAt(999, 999)).toBe(Tile.Wall);
    expect(w.inBounds(63, 63)).toBe(true);
    expect(w.inBounds(64, 0)).toBe(false);
  });

  it('spawn/remove/byId/ofKind', () => {
    const w = new WorldStore();
    const e = w.spawn(EntityKind.Twisted, 5, 5, 30, 1.2);
    expect(w.ofKind(EntityKind.Twisted)).toHaveLength(1);
    expect(w.byId(e.id)).toBe(e);
    expect(w.remove(e.id)).toBe(true);
    expect(w.remove(e.id)).toBe(false);
    expect(w.ofKind(EntityKind.Twisted)).toHaveLength(0);
  });

  it('序列化往返一致 (验收标准 #4)', () => {
    const w = new WorldStore();
    w.setTile(3, 4, Tile.Ore);
    w.setTile(0, 0, Tile.Road);
    w.spawn(EntityKind.Twisted, 10.5, 20.25, 30, 1.2);
    w.spawn(EntityKind.Tower, 30, 30, 50, 0);
    w.coreHp = 73;
    w.tick = 12345;

    const snap = JSON.parse(JSON.stringify(w.serialize())); // 过一遍 JSON, 模拟 localStorage
    const w2 = WorldStore.deserialize(snap);

    expect(w2.serialize()).toEqual(w.serialize());
    expect(w2.tileAt(3, 4)).toBe(Tile.Ore);
    expect(w2.entities).toHaveLength(2);
    expect(w2.coreHp).toBe(73);
    expect(w2.byId(1)!.x).toBe(10.5);
  });

  it('反序列化后 id 分配不冲突', () => {
    const w = new WorldStore();
    w.spawn(EntityKind.Twisted, 1, 1, 10, 1);
    const w2 = WorldStore.deserialize(JSON.parse(JSON.stringify(w.serialize())));
    const e = w2.spawn(EntityKind.Twisted, 2, 2, 10, 1);
    expect(e.id).toBe(2);
  });
});
