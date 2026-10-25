/**
 * HUD store (zustand): sim 事件的只读投影 (技术文档 §3.4 单向数据流)
 * UI 永不直接改 sim; 反向只通过 cmd_* 事件发指令。
 */
import { create } from 'zustand';
import { Phase } from '@misthold/sim';

export type AlertLevel = 'P0' | 'P1' | 'P2' | 'P3';

export interface Alert {
  id: number;
  level: AlertLevel;
  text: string;
}

export interface Resources {
  food: number;
  wood: number;
  iron: number;
  metal: number;
}

export interface HudState {
  day: number;
  phase: Phase;
  countdownS: number;
  resources: Resources;
  rates: Resources;
  power: { gen: number; use: number };
  coreHp: number;
  coreMaxHp: number;
  enemyCount: number;
  paused: boolean;
  speed: number;
  alerts: Alert[];
  minimap: { tiles: number[]; enemies: { x: number; y: number }[]; core: { x: number; y: number } };
  /** 放置模式中的建筑名 (sim 权威, UI/render 只读投影) */
  placement: string | null;
  setPeriod: (day: number, phase: Phase, countdownS: number) => void;
  setResources: (r: Resources, rates: Resources) => void;
  setPower: (gen: number, use: number) => void;
  setCore: (hp: number, max: number) => void;
  setEnemyCount: (n: number) => void;
  pushAlert: (level: AlertLevel, text: string) => void;
  dismissAlert: (id: number) => void;
  setPaused: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setMinimap: (m: HudState['minimap']) => void;
  setPlacement: (kind: string | null) => void;
}

let alertSeq = 1;

export const useHud = create<HudState>((set) => ({
  day: 1,
  phase: Phase.Prep,
  countdownS: 0,
  resources: { food: 120, wood: 80, iron: 40, metal: 0 },
  rates: { food: 0, wood: 0, iron: 0, metal: 0 },
  power: { gen: 10, use: 0 },
  coreHp: 100,
  coreMaxHp: 100,
  enemyCount: 0,
  paused: false,
  speed: 1,
  alerts: [],
  minimap: { tiles: [], enemies: [], core: { x: 32, y: 32 } },
  placement: null,

  setPeriod: (day, phase, countdownS) => set({ day, phase, countdownS }),
  setResources: (resources, rates) => set({ resources, rates }),
  setPower: (gen, use) => set({ power: { gen, use } }),
  setCore: (hp, max) => set({ coreHp: hp, coreMaxHp: max }),
  setEnemyCount: (n) => set({ enemyCount: n }),
  pushAlert: (level, text) =>
    set((s) => ({ alerts: [...s.alerts.slice(-4), { id: alertSeq++, level, text }] })),
  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed }),
  setMinimap: (minimap) => set({ minimap }),
  setPlacement: (placement) => set({ placement }),
}));

/** UI -> sim 的指令 (UI 模块只发事件, 不碰 sim) */
export const cmd = {
  /** 进入/退出放置模式 (无坐标 = 选卡; sim 权威) */
  placeBuilding: (kind: string) => ({ type: 'cmd_place_building' as const, kind }),
  cancelPlacement: () => ({ type: 'cmd_cancel_placement' as const }),
  /** 画布点击的地块坐标 (render 层发出) */
  mapClick: (x: number, y: number) => ({ type: 'cmd_map_click' as const, x, y }),
  setPause: (paused: boolean) => ({ type: 'cmd_set_pause' as const, paused }),
  setSpeed: (speed: number) => ({ type: 'cmd_set_speed' as const, speed }),
};

/** 指令发射器: UiModule init 时注入 (总线); 组件永远只发 cmd_* 事件, 不直接改 sim */
type CmdEmitter = (e: { type: string } & Record<string, unknown>) => void;
let emitter: CmdEmitter | null = null;

export function setCmdEmitter(fn: CmdEmitter): void {
  emitter = fn;
}

export function sendCmd(e: { type: string } & Record<string, unknown>): void {
  emitter?.(e);
}
