/**
 * WorldStore: sim 唯一权威状态 (技术文档 §3.4 单向数据流)
 * - 渲染层只读, 反向只发指令
 * - serialize/deserialize 全量快照 (localStorage 槽位, 验收标准 #4 序列化往返)
 */
import { EntityKind, Tile } from './types.js';
import type { Entity, WorldSnapshot } from './types.js';

export class WorldStore {
  static readonly WIDTH = 64;
  static readonly HEIGHT = 64;

  readonly tiles: Uint8Array;
  readonly entities: Entity[] = [];
  coreHp = 100;
  coreMaxHp = 100;
  coreX = 32;
  coreY = 32;
  tick = 0;
  private nextId = 1;

  constructor() {
    this.tiles = new Uint8Array(WorldStore.WIDTH * WorldStore.HEIGHT);
  }

  idx(x: number, y: number): number {
    return y * WorldStore.WIDTH + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < WorldStore.WIDTH && y < WorldStore.HEIGHT;
  }

  /** 越界视为墙 (寻路/碰撞安全默认值) */
  tileAt(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) return Tile.Wall;
    return this.tiles[this.idx(x, y)] as Tile;
  }

  setTile(x: number, y: number, t: Tile): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[this.idx(x, y)] = t;
  }

  spawn(kind: EntityKind, x: number, y: number, hp: number, speed: number, tex?: string): Entity {
    const e: Entity = { id: this.nextId++, kind, x, y, hp, maxHp: hp, speed };
    if (tex) e.tex = tex;
    this.entities.push(e);
    return e;
  }

  remove(id: number): boolean {
    const i = this.entities.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.entities.splice(i, 1);
    return true;
  }

  byId(id: number): Entity | undefined {
    return this.entities.find((e) => e.id === id);
  }

  ofKind(kind: EntityKind): Entity[] {
    return this.entities.filter((e) => e.kind === kind);
  }

  serialize(): WorldSnapshot {
    return {
      tick: this.tick,
      tiles: Array.from(this.tiles),
      entities: this.entities.map((e) => ({ ...e })),
      coreHp: this.coreHp,
      coreMaxHp: this.coreMaxHp,
      coreX: this.coreX,
      coreY: this.coreY,
      nextId: this.nextId,
    };
  }

  static deserialize(s: WorldSnapshot): WorldStore {
    const w = new WorldStore();
    w.tiles.set(Uint8Array.from(s.tiles));
    w.entities.length = 0;
    for (const e of s.entities) w.entities.push({ ...e });
    w.coreHp = s.coreHp;
    w.coreMaxHp = s.coreMaxHp;
    w.coreX = s.coreX;
    w.coreY = s.coreY;
    w.tick = s.tick;
    w.nextId = s.nextId;
    return w;
  }
}
