/**
 * FogLayer: 双雾视觉 (美术文档 §1.4)
 * - 黑雾: 半透明体积雾团, 缓慢翻涌; 入侵期从边缘推进 (alpha/scale 上升)
 * - 灰雾: 低饱和平雾贴地图四缘
 */
import { Container, Sprite, Texture } from 'pixi.js';

interface Drifter {
  sprite: Sprite;
  vx: number;
  vy: number;
  vr: number;
  phase: number;
}

export class FogLayer {
  readonly container = new Container();
  private readonly black: Drifter[] = [];
  private readonly gray: Drifter[] = [];
  /** 入侵进度 0..1: 黑雾覆盖程度 */
  invade = 0;

  constructor(
    tex: Map<string, Texture>,
    worldW: number,
    worldH: number,
  ) {
    const mk = (id: string, scale: number, drift: number, layer: Drifter[]) => {
      const t = tex.get(id);
      if (!t) return;
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.scale.set(scale);
      s.x = Math.random() * worldW;
      s.y = Math.random() * worldH;
      s.alpha = 0.55;
      this.container.addChild(s);
      layer.push({
        sprite: s,
        vx: (Math.random() - 0.5) * drift,
        vy: (Math.random() - 0.5) * drift,
        vr: (Math.random() - 0.5) * 0.008,
        phase: Math.random() * Math.PI * 2,
      });
    };
    for (let i = 1; i <= 3; i++) mk(`fx.black_mist_${i}`, 1.6 + i * 0.3, 14, this.black);
    for (let i = 1; i <= 2; i++) mk(`fx.gray_mist_${i}`, 2.2, 8, this.gray);
  }

  update(dtMs: number, elapsedS: number): void {
    const dt = dtMs / 1000;
    for (const d of this.black) this.step(d, dt, elapsedS, 0.35 + 0.65 * this.invade);
    for (const d of this.gray) this.step(d, dt, elapsedS, 0.22);
  }

  private step(d: Drifter, dt: number, elapsedS: number, baseAlpha: number): void {
    d.sprite.x += d.vx * dt;
    d.sprite.y += d.vy * dt;
    d.sprite.rotation += d.vr * dt;
    const pulse = 0.75 + 0.25 * Math.sin(elapsedS * 0.6 + d.phase);
    d.sprite.alpha = baseAlpha * pulse;
  }
}
