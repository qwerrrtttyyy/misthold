/**
 * Scheduler: 固定 60Hz 定步长 + 暂停 = 天然塔防规则 (技术文档 §3.3)
 * - fixedUpdate: 模拟层, 固定 1000/60 ms, 掉帧时最多补 5 步防死亡螺旋
 * - update: 表现层, 每帧一次, 暂停时仍调用 (停 stepping 不停 rendering)
 */
import type { GameModule } from './module.js';

export const FIXED_STEP_MS = 1000 / 60;
const MAX_CATCHUP_STEPS = 5;
/** 单帧 dt 上限 (切后台回来不追帧) */
const MAX_FRAME_MS = 250;

export class Scheduler {
  private readonly targets = new Set<GameModule>();
  private acc = 0;
  private last: number | null = null;
  private rafId: number | null = null;
  private running = false;

  paused = false;
  /** 时间流速倍率 (可调游戏速度, 美术文档 §4.6 无障碍) */
  timeScale = 1;

  add(mod: GameModule): void {
    this.targets.add(mod);
  }

  remove(mod: GameModule): void {
    this.targets.delete(mod);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = null;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  togglePause(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.1, Math.min(10, scale));
  }

  /** 清空累积时间 (读档/重开时调用) */
  reset(): void {
    this.acc = 0;
    this.last = null;
  }

  /**
   * 推进一帧。rAF 与无头测试共用此入口 (测试注入假时间戳)。
   */
  tick(nowMs: number): void {
    if (this.last === null) {
      this.last = nowMs;
      return;
    }
    const dt = Math.min(nowMs - this.last, MAX_FRAME_MS);
    this.last = nowMs;

    if (!this.paused) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= FIXED_STEP_MS && steps < MAX_CATCHUP_STEPS) {
        for (const mod of this.targets) mod.fixedUpdate?.(FIXED_STEP_MS);
        this.acc -= FIXED_STEP_MS;
        steps++;
      }
      if (steps === MAX_CATCHUP_STEPS) this.acc = 0; // 死亡螺旋保护
    }

    for (const mod of this.targets) mod.update?.(dt);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.tick(now);
    this.rafId = requestAnimationFrame(this.loop);
  };
}
