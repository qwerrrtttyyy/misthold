/**
 * TerrainLayer: 64x64 地块网格 (技术文档 P0 切片: 固定 64x64)
 * 图案由 seeded Rng 决定 (可复现); tile 128px (美术文档 §1.5)。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { Rng } from '@misthold/sim';
import { Tile } from '@misthold/sim';

export const TILE_PX = 128;

export class TerrainLayer {
  readonly container = new Container();

  constructor(
    private readonly tex: Map<string, Texture>,
    width: number,
    height: number,
    seed = 'misthold-terrain-v1',
  ) {
    const rng = new Rng(seed);
    const pick = (name: string, n: number) => `terrain.${name}_${rng.int(1, n).toString().padStart(2, '0')}`;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let id: string;
        const roll = rng.next();
        if (roll < 0.62) id = pick('grass', 4);
        else if (roll < 0.74) id = pick('grass_blend', 4);
        else if (roll < 0.80) id = pick('path', 5);
        else if (roll < 0.86) id = pick('path_blend', 5);
        else if (roll < 0.90) id = pick('tree_small', 4);
        else if (roll < 0.93) id = pick('tree_big', 2);
        else if (roll < 0.96) id = pick('rock', 9);
        else if (roll < 0.98) id = pick('water', 5);
        else id = pick('platform', 3);

        const s = new Sprite(this.tex.get(id) ?? Texture.WHITE);
        s.x = x * TILE_PX;
        s.y = y * TILE_PX;
        this.container.addChild(s);
      }
    }
    // 中心区清出建造平台 (核心区)
    for (let y = 28; y <= 36; y++) {
      for (let x = 28; x <= 36; x++) {
        const i = y * width + x;
        const s = this.container.getChildAt(i);
        if (s instanceof Sprite) s.texture = this.tex.get('terrain.platform_01') ?? s.texture;
      }
    }
  }
}

export { Tile };
