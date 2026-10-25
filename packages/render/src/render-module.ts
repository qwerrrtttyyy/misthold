/**
 * RenderModule: 渲染适配层 (技术文档 §3.4: 只读 sim, 反向只发指令)
 * 组装: terrain + fog + entity 三层 + camera; 双雾入侵进度跟随周期阶段。
 */
import { Sprite } from 'pixi.js';
import type { Application, Texture } from 'pixi.js';
import type { GameModule, ModuleContext } from '@misthold/kernel';
import { Phase, Tile, WorldStore } from '@misthold/sim';
import { createApp } from './pixi-app.js';
import { loadManifest, loadTextures } from './asset-loader.js';
import { Camera2D } from './camera.js';
import { bindCameraInput } from './camera-input.js';
import { EntityLayer } from './entity-layer.js';
import { FogLayer } from './fog-layer.js';
import { TerrainLayer, TILE_PX } from './terrain-layer.js';

/** 放置模式 ghost 的建筑贴图 (表现层映射, sim 不管精灵) */
const GHOST_TEX: Record<string, string> = {
  箭塔: 'building.tower_arrow_01',
  霜冻塔: 'building.tower_arrow_01',
  城墙: 'building.wall_01',
  民居: 'building.house',
  净水站: 'building.farm',
  锯木厂: 'building.lumber',
  冶炼厂: 'building.mine',
};

/** 点击与拖动的判定阈值 (px): 小于此距离视为点击而非相机平移 */
const CLICK_SLOP = 6;

export class RenderModule implements GameModule {
  readonly id = 'render';
  /** 依赖 sim.world 服务的提供者 (最终版为 'sim' 模块; 切片期由 demo-sim 提供) */
  readonly deps = ['demo-sim'];

  private ctx: ModuleContext | null = null;
  private app: Application | null = null;
  private camera = new Camera2D();
  private unbindInput: (() => void) | null = null;
  private terrain: TerrainLayer | null = null;
  private fog: FogLayer | null = null;
  private entities: EntityLayer | null = null;
  private elapsedS = 0;
  private phase: Phase = Phase.Prep;
  /** 渲染层降级标记 (WebGL 不可用) */
  failed = false;
  /** 放置模式 (sim 权威投影): 非空时画布点击 = 尝试建造 */
  private ghostKind: string | null = null;
  private ghost: Sprite | null = null;
  private hoverTile: { x: number; y: number } | null = null;
  private unbindGhost: (() => void) | null = null;

  async init(ctx: ModuleContext): Promise<void> {
    this.ctx = ctx;
    const canvas = ctx.services.get<HTMLCanvasElement>('platform.canvas');
    try {
      this.app = await createApp(canvas);
    } catch (err) {
      // 平台层降级: WebGL 不可用时不让渲染失败拖死整个 boot (sim/HUD 继续跑)
      this.failed = true;
      console.error('[render] Pixi init failed, degraded mode:', err);
      ctx.events.emit('alert', {
        level: 'P0',
        text: `渲染层初始化失败 (WebGL 不可用?): ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    ctx.services.register('render.app', this.app);
    ctx.services.register('render.camera', this.camera); // 调试/工具: 屏幕<->世界换算
    console.info('[render] pixi app ready');

    const manifest = await loadManifest(ctx.config.get<string>('assets.manifestUrl') ?? '/manifest.json');
    console.info('[render] manifest loaded:', Object.values(manifest.categories).flat().length, 'entries');
    const tex = await loadTextures(manifest);
    console.info('[render] textures loaded:', tex.size);
    ctx.services.register('render.textures', tex);

    const world = ctx.services.get<WorldStore>('sim.world');
    const worldW = WorldStore.WIDTH * TILE_PX;
    const worldH = WorldStore.HEIGHT * TILE_PX;

    this.camera.setWorld(worldW, worldH);
    this.camera.centerOn(world.coreX * TILE_PX, world.coreY * TILE_PX);
    this.camera.setScreen(this.app.renderer.width, this.app.renderer.height);

    this.terrain = new TerrainLayer(tex, WorldStore.WIDTH, WorldStore.HEIGHT);
    this.fog = new FogLayer(tex, worldW, worldH);
    this.entities = new EntityLayer(tex);

    // 辉光核心光圈 (美术文档 §1.4: 全图唯一持续光源)
    const glowTex = tex.get('fx.glow_core');
    if (glowTex) {
      const glow = new Sprite(glowTex);
      glow.anchor.set(0.5);
      glow.scale.set(2.2);
      glow.x = world.coreX * TILE_PX;
      glow.y = world.coreY * TILE_PX;
      glow.blendMode = 'add';
      this.entities.container.addChildAt(glow, 0);
    }

    this.camera.root.addChild(this.terrain.container, this.fog.container, this.entities.container);
    this.app.stage.addChild(this.camera.root);

    this.unbindInput = bindCameraInput(canvas, this.camera);

    // 放置模式 ghost (跟随鼠标, 绿=可建/红=不可建; 触屏取最后一次点击位置)
    const ghostTex = tex.get('building.house');
    if (ghostTex) {
      this.ghost = new Sprite(ghostTex);
      this.ghost.anchor.set(0.5);
      this.ghost.alpha = 0.6;
      this.ghost.visible = false;
      this.camera.root.addChild(this.ghost);
    }

    ctx.events.on('placement_changed', (p) => {
      this.ghostKind = (p as { kind: string | null }).kind;
      if (this.ghostKind && this.ghost) {
        const id = GHOST_TEX[this.ghostKind];
        const t = id ? tex.get(id) : undefined;
        if (t) this.ghost.texture = t;
      }
      if (this.ghost) this.ghost.visible = this.ghostKind !== null && this.hoverTile !== null;
    });

    // 画布交互: 点击(位移<阈值) = cmd_map_click; 右键/Esc 外取消由 UI 负责
    let downX = 0;
    let downY = 0;
    let downButton = -1;
    const onGhostDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downButton = e.button;
    };
    const onGhostMove = (e: PointerEvent) => {
      if (!this.ghostKind || e.pointerType === 'touch') return;
      const rect = canvas.getBoundingClientRect();
      const w = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      this.hoverTile = { x: Math.floor(w.x / TILE_PX), y: Math.floor(w.y / TILE_PX) };
    };
    const onGhostUp = (e: PointerEvent) => {
      if (e.button === 2 || downButton === 2) {
        // 右键取消放置
        if (this.ghostKind) ctx.events.emit('cmd_cancel_placement', {});
        return;
      }
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > CLICK_SLOP || !this.ghostKind) return;
      const rect = canvas.getBoundingClientRect();
      const w = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const tx = Math.floor(w.x / TILE_PX);
      const ty = Math.floor(w.y / TILE_PX);
      this.hoverTile = { x: tx, y: ty };
      ctx.events.emit('cmd_map_click', { x: tx, y: ty });
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener('pointerdown', onGhostDown);
    canvas.addEventListener('pointermove', onGhostMove);
    window.addEventListener('pointerup', onGhostUp);
    canvas.addEventListener('contextmenu', onCtx);
    this.unbindGhost = () => {
      canvas.removeEventListener('pointerdown', onGhostDown);
      canvas.removeEventListener('pointermove', onGhostMove);
      window.removeEventListener('pointerup', onGhostUp);
      canvas.removeEventListener('contextmenu', onCtx);
    };

    // 周期阶段 -> 黑雾入侵进度 (只读投影; kernel EventBus 保持泛型, 载荷在此收敛)
    ctx.events.on('period_changed', (p) => {
      this.phase = (p as { phase: Phase }).phase;
    });
    const resize = () => {
      if (this.app) this.camera.setScreen(this.app.renderer.width, this.app.renderer.height);
    };
    window.addEventListener('resize', resize);
    ctx.events.once('kernel_disposing', () => window.removeEventListener('resize', resize));
  }

  update(dtMs: number): void {
    if (this.failed) return; // 降级模式: 不渲染
    this.elapsedS += dtMs / 1000;
    // 入侵期黑雾推进目标 (预警期预升, 入侵期拉满, 筹备/清算回落)
    if (this.fog) {
      const target = this.phase === Phase.Invade ? 1 : this.phase === Phase.Warn ? 0.45 : 0.12;
      this.fog.invade += (target - this.fog.invade) * Math.min(1, dtMs / 800);
      this.fog.update(dtMs, this.elapsedS);
    }
    const world = this.ctx?.services.tryGet<WorldStore>('sim.world');
    if (world) this.entities?.sync(world);
    this.updateGhost(world);
    this.camera.apply();
  }

  /** ghost: 位置跟随 hover,  tint 绿/红 反馈可建性 (与 sim tryPlace 同规则的投影) */
  private updateGhost(world: WorldStore | undefined): void {
    if (!this.ghost || this.ghostKind === null || this.hoverTile === null) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const { x, y } = this.hoverTile;
    this.ghost.visible = true;
    this.ghost.x = (x + 0.5) * TILE_PX;
    this.ghost.y = (y + 0.5) * TILE_PX;
    let ok = true;
    if (world) {
      const tile = world.tileAt(x, y);
      ok =
        world.inBounds(x, y) &&
        tile !== Tile.Water &&
        tile !== Tile.Wall &&
        tile !== Tile.Polluted &&
        !(x === world.coreX && y === world.coreY) &&
        !world.entities.some((e) => Math.abs(e.x - x) < 0.9 && Math.abs(e.y - y) < 0.9);
    }
    this.ghost.tint = ok ? 0x8fe08a : 0xe08a8a;
  }

  dispose(): void {
    this.unbindInput?.();
    this.unbindGhost?.();
    this.app?.destroy();
    this.app = null;
    this.ctx = null;
  }
}

/** 查询渲染层是否降级 (组装层/调试用) */
export function isRenderDegraded(mod: RenderModule): boolean {
  return mod.failed;
}
