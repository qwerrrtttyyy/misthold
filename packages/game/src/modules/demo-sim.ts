/**
 * DemoSimModule: P0 切片的最小可玩闭环 (技术文档 §1.1)
 * 放置建筑 -> 资源增长 -> 黑雾倒计时 -> 一波变异体进攻辉光核心 -> 战后结算
 * 本模块是 sim 侧演示装配: 数据全部来自 data/demo.json (改平衡不动代码)。
 */
import type { GameModule, ModuleContext } from '@misthold/kernel';
import { EntityKind, Phase, Rng, Tile, WorldStore } from '@misthold/sim';
import type { MistholdEvents } from '@misthold/ui';
import type { EventBus } from '@misthold/kernel';

interface TowerStats {
  range: number;
  damage: number;
  intervalMs: number;
  hp: number;
}

interface BuildingDef {
  /** production=产出建筑(加速率) / tower=防御塔 / wall=城墙(改地块) / stub=切片未实现 */
  type: 'production' | 'tower' | 'wall' | 'stub';
  tex?: string;
  cost?: Partial<Record<'food' | 'wood' | 'iron' | 'metal', number>>;
  rate?: Partial<Record<'food' | 'wood' | 'iron' | 'metal', number>>;
  stats?: Partial<TowerStats>;
}

interface DemoConfig {
  phases: { phase: Phase; durationS: number }[];
  resources: {
    food: number; wood: number; iron: number; metal: number;
    rates: Record<'food' | 'wood' | 'iron' | 'metal', number>;
  };
  power: { gen: number; use: number };
  towers: { x: number; y: number }[];
  towerStats: TowerStats;
  enemyStats: { hp: number; speed: number; spawnIntervalMs: number; coreDamage: number };
  buildingDefs: Record<string, BuildingDef>;
}

export class DemoSimModule implements GameModule {
  readonly id = 'demo-sim';
  readonly deps = [];

  private ctx!: ModuleContext;
  private bus!: EventBus<MistholdEvents>;
  private world!: WorldStore;
  private cfg!: DemoConfig;

  private towers: { id: number; cooldownMs: number; stats: TowerStats }[] = [];
  private phaseIdx = 0;
  private phaseElapsedS = 0;
  private day = 1;
  private waveIndex = 0;
  private emitAcc = 0;
  private spawnAcc = 0;
  private minimapAcc = 0;
  private lastEnemyCount = -1;
  private coreWarned = false;
  private rng = new Rng('misthold-demo-v1');
  /** 放置模式 (sim 权威): UI 选卡进入, 画布点击尝试建造 */
  private placement: string | null = null;
  /** 运行时资源存量 (cfg 是静态配置, 永不改写; 本类持有可变状态) */
  private res: { food: number; wood: number; iron: number; metal: number } = { food: 0, wood: 0, iron: 0, metal: 0 };
  /** 产出建筑的速率加成 (叠加在 demo.json 基础速率上) */
  private rateBonus: Record<'food' | 'wood' | 'iron' | 'metal', number> = { food: 0, wood: 0, iron: 0, metal: 0 };
  private wallCount = 0;
  private offs: (() => void)[] = [];

  init(ctx: ModuleContext): void {
    this.ctx = ctx;
    this.bus = ctx.events as unknown as EventBus<MistholdEvents>;
    this.cfg = ctx.config.require<DemoConfig>('demo');
    this.world = new WorldStore();
    ctx.services.register('sim.world', this.world);

    // 初始资源/电力 (运行时状态从 cfg 拷贝, cfg 保持只读)
    const { food, wood, iron, metal } = this.cfg.resources;
    this.res = { food, wood, iron, metal };
    this.bus.emit('resources_changed', { resources: { ...this.res }, rates: this.effectiveRates() });
    this.bus.emit('power_changed', this.cfg.power);
    this.bus.emit('core_state', { hp: this.world.coreHp, max: this.world.coreMaxHp });

    // 演示布防: 核心四角箭塔 (技术文档 §1.2 切片范围: 1 种防御塔)
    for (const t of this.cfg.towers) {
      const e = this.world.spawn(EntityKind.Tower, t.x, t.y, this.cfg.towerStats.hp, 0);
      this.towers.push({ id: e.id, cooldownMs: 0, stats: this.cfg.towerStats });
      this.world.setTile(t.x, t.y, Tile.Platform);
    }

    // 放置模式指令 (UI 选卡 / render 画布点击 / 取消)
    this.offs.push(
      this.bus.on('cmd_place_building', ({ kind }) => this.enterPlacement(kind)),
      this.bus.on('cmd_cancel_placement', () => this.exitPlacement()),
      this.bus.on('cmd_map_click', ({ x, y }) => this.onMapClick(x, y)),
    );

    // 周期初始态
    this.emitPeriod(this.cfg.phases[0]!.durationS);
    this.bus.emit('alert', {
      level: 'P3',
      text: '演示就绪: 拖动平移 · 滚轮/双指缩放 · 空格暂停',
    });
  }

  fixedUpdate(stepMs: number): void {
    const def = this.cfg.phases[this.phaseIdx]!;
    this.phaseElapsedS += stepMs / 1000;
    const remain = Math.max(0, def.durationS - this.phaseElapsedS);

    if (this.phaseElapsedS >= def.durationS) {
      this.phaseIdx = (this.phaseIdx + 1) % this.cfg.phases.length;
      this.phaseElapsedS = 0;
      if (this.phaseIdx === 0) {
        this.day += 1;
        this.coreWarned = false;
        // 战后回血一小截 (演示战后重建)
        this.world.coreHp = Math.min(this.world.coreMaxHp, this.world.coreHp + 12);
        this.bus.emit('core_state', { hp: this.world.coreHp, max: this.world.coreMaxHp });
      }
      if (this.phaseIdx === 2) {
        this.waveIndex += 1;
        this.bus.emit('wave_started', { index: this.waveIndex });
        this.bus.emit('alert', { level: 'P1', text: `第 ${this.waveIndex} 波雾潮逼近, 黑雾自边缘涌入` });
      }
      if (this.phaseIdx === 3) {
        this.bus.emit('alert', { level: 'P3', text: '入侵结束 · 战后结算: 残骸可回收为素材' });
      }
      this.emitPeriod(this.cfg.phases[this.phaseIdx]!.durationS);
    }

    // 节流发射 (4/s): 倒计时 + 资源
    this.emitAcc += stepMs;
    if (this.emitAcc >= 250) {
      this.emitAcc = 0;
      this.emitPeriod(remain);
      this.emitResources(stepMs);
    }

    if (def.phase === Phase.Invade) {
      this.stepCombat(stepMs);
    } else {
      this.spawnAcc = 0;
    }

    // 小地图 2/s
    this.minimapAcc += stepMs;
    if (this.minimapAcc >= 500) {
      this.minimapAcc = 0;
      this.emitMinimap();
    }
  }

  /** 入侵期: 生成 -> 寻路(直线向核心) -> 塔击 -> 核心受击 */
  private stepCombat(stepMs: number): void {
    const es = this.cfg.enemyStats;
    this.spawnAcc += stepMs;
    if (this.spawnAcc >= es.spawnIntervalMs) {
      this.spawnAcc = 0;
      // 从地图边缘随机一侧进雾
      const side = this.rng.int(0, 3);
      const x = side === 0 ? this.rng.int(2, 8) : side === 1 ? this.rng.int(56, 62) : this.rng.int(8, 56);
      const y = side === 2 ? this.rng.int(2, 8) : side === 3 ? this.rng.int(56, 62) : this.rng.int(2, 62);
      this.world.spawn(EntityKind.Twisted, x, y, es.hp, es.speed);
    }

    const core = { x: this.world.coreX, y: this.world.coreY };
    const dtS = stepMs / 1000;
    for (const e of [...this.world.entities]) {
      if (e.kind !== EntityKind.Twisted) continue;
      const dx = core.x - e.x;
      const dy = core.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.7) {
        // 抵达核心: 造成伤害并消散
        this.world.coreHp -= es.coreDamage;
        this.world.remove(e.id);
        this.bus.emit('core_state', { hp: Math.max(0, this.world.coreHp), max: this.world.coreMaxHp });
        this.bus.emit('enemy_killed', { id: e.id, kind: 'leak' });
        if (this.world.coreHp <= 30 && !this.coreWarned) {
          this.coreWarned = true;
          this.bus.emit('alert', { level: 'P0', text: '辉光核心危急! 启动背水一战' });
        }
        if (this.world.coreHp <= 0) {
          this.bus.emit('alert', { level: 'P0', text: '城邦覆灭 (演示: 下周期自动重建)' });
          this.world.coreHp = this.world.coreMaxHp;
          this.bus.emit('core_state', { hp: this.world.coreHp, max: this.world.coreMaxHp });
        }
        continue;
      }
      e.x += (dx / dist) * e.speed * dtS;
      e.y += (dy / dist) * e.speed * dtS;
    }

    // 塔击: 范围内最近敌人 (每塔独立 stats: 霜冻塔等变体)
    for (const t of this.towers) {
      t.cooldownMs -= stepMs;
      const tower = this.world.byId(t.id);
      if (!tower || t.cooldownMs > 0) continue;
      let target: (typeof this.world.entities)[number] | null = null;
      let best = t.stats.range;
      for (const e of this.world.ofKind(EntityKind.Twisted)) {
        const d = Math.hypot(e.x - tower.x, e.y - tower.y);
        if (d <= best) {
          best = d;
          target = e;
        }
      }
      if (target) {
        t.cooldownMs = t.stats.intervalMs;
        target.hp -= t.stats.damage;
        if (target.hp <= 0) {
          this.world.remove(target.id);
          this.bus.emit('enemy_killed', { id: target.id, kind: 'tower' });
        }
      }
    }

    const n = this.world.ofKind(EntityKind.Twisted).length;
    if (n !== this.lastEnemyCount) {
      this.lastEnemyCount = n;
      this.bus.emit('enemy_count', { n });
    }
  }

  private emitPeriod(countdownS: number): void {
    this.bus.emit('period_changed', {
      day: this.day,
      phase: this.cfg.phases[this.phaseIdx]!.phase,
      countdownS,
    });
  }

  private emitResources(stepMs: number): void {
    const rates = this.cfg.resources.rates;
    const bonus = this.rateBonus;
    const grow = (v: number, rate: number) => Math.min(9999, v + (rate * stepMs) / 1000);
    this.res = {
      food: grow(this.res.food, rates.food + bonus.food),
      wood: grow(this.res.wood, rates.wood + bonus.wood),
      iron: grow(this.res.iron, rates.iron + bonus.iron),
      metal: grow(this.res.metal, rates.metal + bonus.metal),
    };
    this.bus.emit('resources_changed', { resources: { ...this.res }, rates: this.effectiveRates() });
  }

  // ---- 放置模式 (验收标准 #2: 建采集/建塔; sim 是唯一权威) ----

  private effectiveRates(): Record<'food' | 'wood' | 'iron' | 'metal', number> {
    const b = this.cfg.resources.rates;
    return {
      food: b.food + this.rateBonus.food,
      wood: b.wood + this.rateBonus.wood,
      iron: b.iron + this.rateBonus.iron,
      metal: b.metal + this.rateBonus.metal,
    };
  }

  private enterPlacement(kind: string): void {
    // 再点一次同名卡 = 取消
    this.placement = this.placement === kind ? null : kind;
    this.bus.emit('placement_changed', { kind: this.placement });
  }

  private exitPlacement(): void {
    if (this.placement === null) return;
    this.placement = null;
    this.bus.emit('placement_changed', { kind: null });
  }

  private onMapClick(x: number, y: number): void {
    if (this.placement === null) return;
    this.tryPlace(this.placement, x, y);
  }

  /** 尝试建造: 定义 -> 地块 -> 占用 -> 资源 -> 扣费放置; 失败保留放置模式可重试 */
  private tryPlace(kind: string, x: number, y: number): void {
    const fail = (reason: string) => this.bus.emit('build_result', { ok: false, kind, reason });
    const def = this.cfg.buildingDefs[kind];
    if (!def || def.type === 'stub') {
      fail(`${kind}: P0 切片未实现 (正式版开放)`);
      return;
    }
    if (!this.world.inBounds(x, y)) {
      fail('超出地图范围');
      return;
    }
    const tile = this.world.tileAt(x, y);
    if (tile === Tile.Water || tile === Tile.Wall || tile === Tile.Polluted) {
      fail('该地形不可建造');
      return;
    }
    if (x === this.world.coreX && y === this.world.coreY) {
      fail('辉光核心所在格不可占用');
      return;
    }
    if (this.world.entities.some((e) => Math.abs(e.x - x) < 0.9 && Math.abs(e.y - y) < 0.9)) {
      fail('目标格已被占用');
      return;
    }
    const cost = def.cost ?? {};
    for (const k of ['food', 'wood', 'iron', 'metal'] as const) {
      if (this.res[k] < (cost[k] ?? 0)) {
        fail(`资源不足: 缺 ${k === 'food' ? '食物' : k === 'wood' ? '木材' : k === 'iron' ? '铁矿' : '精炼金属'}`);
        return;
      }
    }

    // 扣费 (运行时状态)
    for (const k of ['food', 'wood', 'iron', 'metal'] as const) {
      this.res[k] -= cost[k] ?? 0;
    }

    if (def.type === 'tower') {
      const stats: TowerStats = { ...this.cfg.towerStats, ...def.stats };
      const e = this.world.spawn(EntityKind.Tower, x, y, stats.hp, 0, def.tex);
      this.towers.push({ id: e.id, cooldownMs: 0, stats });
      this.world.setTile(x, y, Tile.Platform);
    } else if (def.type === 'production') {
      this.world.spawn(EntityKind.Building, x, y, 50, 0, def.tex);
      for (const k of ['food', 'wood', 'iron', 'metal'] as const) {
        this.rateBonus[k] += def.rate?.[k] ?? 0;
      }
      this.world.setTile(x, y, Tile.Platform);
    } else {
      // wall: 改地块 + 变体精灵 (7 循环)
      this.world.setTile(x, y, Tile.Wall);
      this.wallCount += 1;
      const variant = ((this.wallCount - 1) % 7) + 1;
      this.world.spawn(EntityKind.Building, x, y, 120, 0, `building.wall_0${variant}`);
    }

    this.bus.emit('resources_changed', {
      resources: { ...this.res },
      rates: this.effectiveRates(),
    });
    this.bus.emit('build_result', { ok: true, kind });
    this.exitPlacement();
  }

  private emitMinimap(): void {
    // 64x64 -> 16x16 降采样 (多数表决)
    const tiles: number[] = [];
    for (let cy = 0; cy < 16; cy++) {
      for (let cx = 0; cx < 16; cx++) {
        const count = new Map<number, number>();
        for (let y = cy * 4; y < cy * 4 + 4; y++) {
          for (let x = cx * 4; x < cx * 4 + 4; x++) {
            const t = this.world.tileAt(x, y);
            count.set(t, (count.get(t) ?? 0) + 1);
          }
        }
        let bestT = Tile.Plain;
        let bestN = -1;
        for (const [t, n] of count) if (n > bestN) { bestN = n; bestT = t as Tile; }
        tiles.push(bestT);
      }
    }
    const enemies = this.world
      .ofKind(EntityKind.Twisted)
      .map((e) => ({ x: Math.round(e.x) / 4, y: Math.round(e.y) / 4 }));
    this.bus.emit('minimap_state', {
      tiles,
      enemies,
      core: { x: this.world.coreX / 4, y: this.world.coreY / 4 },
    });
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    void this.ctx;
  }
}
