import type { GameModule, ModuleContext } from '@misthold/kernel';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Phase } from '@misthold/sim';
import { setCmdEmitter, useHud } from './store/hud-store.js';
import { App } from './App.js';

export type MistholdEvents = {
  period_changed: { day: number; phase: Phase; countdownS: number };
  resources_changed: {
    resources: Record<'food' | 'wood' | 'iron' | 'metal', number>;
    rates: Record<'food' | 'wood' | 'iron' | 'metal', number>;
  };
  power_changed: { gen: number; use: number };
  core_state: { hp: number; max: number };
  enemy_count: { n: number };
  enemy_killed: { id: number; kind: 'tower' | 'leak' };
  wave_started: { index: number };
  alert: { level: 'P0' | 'P1' | 'P2' | 'P3'; text: string };
  minimap_state: { tiles: number[]; enemies: { x: number; y: number }[]; core: { x: number; y: number } };
  paused_changed: { paused: boolean };
  speed_changed: { speed: number };
  cmd_set_pause: { paused: boolean };
  cmd_set_speed: { speed: number };
  /** 放置模式 (sim 权威): 选卡进入/取消/建造成功均广播 */
  cmd_place_building: { kind: string };
  cmd_cancel_placement: Record<string, never>;
  cmd_map_click: { x: number; y: number };
  placement_changed: { kind: string | null };
  build_result: { ok: boolean; kind: string; reason?: string };
};

/** Kernel 事件总线的最小视图 (kernel 保持泛型, 事件 map 在 ui/game 侧定义) */
interface BusView {
  on<K extends keyof MistholdEvents>(type: K, fn: (payload: MistholdEvents[K]) => void): () => void;
  emit<K extends keyof MistholdEvents>(type: K, payload: MistholdEvents[K]): void;
}

/**
 * UiModule: sim 事件 -> zustand store (只读投影); store -> cmd_* 事件 (反向指令)
 * 快捷键: 空格暂停, 1/2 切速度。
 */
export class UiModule implements GameModule {
  readonly id = 'ui';
  private offs: (() => void)[] = [];

  init(ctx: ModuleContext): void {
    const bus = ctx.events as unknown as BusView;
    const s = useHud.getState();

    // 组件 -> 总线: UI 只发 cmd_* 事件 (暂停/速度/建造), 不直接碰 sim
    setCmdEmitter((e) => bus.emit(e.type as keyof MistholdEvents, e as never));

    this.offs.push(
      bus.on('period_changed', (p) => s.setPeriod(p.day, p.phase, p.countdownS)),
      bus.on('resources_changed', (p) => s.setResources(p.resources, p.rates)),
      bus.on('power_changed', (p) => s.setPower(p.gen, p.use)),
      bus.on('core_state', (p) => s.setCore(p.hp, p.max)),
      bus.on('enemy_count', (p) => s.setEnemyCount(p.n)),
      bus.on('alert', (p) => s.pushAlert(p.level, p.text)),
      bus.on('minimap_state', (p) => s.setMinimap(p)),
      bus.on('paused_changed', (p) => s.setPaused(p.paused)),
      bus.on('speed_changed', (p) => s.setSpeed(p.speed)),
      bus.on('placement_changed', (p) => s.setPlacement(p.kind)),
      bus.on('build_result', (p) => {
        if (!p.ok) s.pushAlert('P2', p.reason ?? `无法建造 ${p.kind}`);
        else s.pushAlert('P3', `已建造 ${p.kind}`);
      }),
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        bus.emit('cmd_set_pause', { paused: !useHud.getState().paused });
      } else if (e.key === '1') bus.emit('cmd_set_speed', { speed: 1 });
      else if (e.key === '2') bus.emit('cmd_set_speed', { speed: 2 });
      else if (e.key === 'Escape') bus.emit('cmd_cancel_placement', {});
    };    window.addEventListener('keydown', onKey);
    this.offs.push(() => window.removeEventListener('keydown', onKey));

    ctx.services.register('ui.mount', (el: HTMLElement) => {
      createRoot(el).render(createElement(App));
    });
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
