/**
 * EntityLayer: sim 实体 -> 精灵投影 (单向数据流: render 永不改 sim)
 * 精灵池: Map<entityId, Sprite>, 每帧同步位置/存活, 新实体按 kind 选精灵。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { EntityKind, WorldStore } from '@misthold/sim';
import { TILE_PX } from './terrain-layer.js';

const KIND_TEXTURE: Record<EntityKind, string> = {
  [EntityKind.Core]: 'building.glow_core_normal',
  [EntityKind.Tower]: 'building.tower_arrow_01',
  [EntityKind.Building]: 'building.house',
  [EntityKind.Human]: 'unit.human_01',
  [EntityKind.Twisted]: 'unit.enemy_twisted_01',
  [EntityKind.Xenogen]: 'unit.enemy_xenogen_01',
  [EntityKind.Demonic]: 'unit.enemy_demonic_01',
  [EntityKind.Automata]: 'unit.enemy_demonic_02',
};

export class EntityLayer {
  readonly container = new Container();
  private readonly sprites = new Map<number, Sprite>();

  constructor(private readonly tex: Map<string, Texture>) {}

  sync(world: WorldStore): void {
    const alive = new Set<number>();
    for (const e of world.entities) {
      alive.add(e.id);
      let s = this.sprites.get(e.id);
      if (!s) {
        const id = e.tex ?? KIND_TEXTURE[e.kind] ?? 'unit.human_01';
        s = new Sprite(this.tex.get(id) ?? Texture.WHITE);
        s.anchor.set(0.5);
        this.container.addChild(s);
        this.sprites.set(e.id, s);
      }
      s.x = e.x * TILE_PX;
      s.y = e.y * TILE_PX;
      // 受击闪白 (低血量) 与受伤透明度
      s.alpha = e.hp / e.maxHp < 0.34 ? 0.55 + 0.35 * Math.abs(Math.sin(e.id + performance.now() / 120)) : 1;
    }
    for (const [id, s] of this.sprites) {
      if (!alive.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
    }
  }

  get count(): number {
    return this.sprites.size;
  }
}
