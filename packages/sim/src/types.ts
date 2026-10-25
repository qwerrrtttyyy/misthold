/** sim 共享类型 (GDD §2.2 周期 / §3.2 地块 / §4 战斗) */

/** 雾潮周期四阶段 (GDD §2.2) */
export enum Phase {
  Prep = 'prep',
  Warn = 'warn',
  Invade = 'invade',
  Settle = 'settle',
}

export const PHASE_LABEL: Record<Phase, string> = {
  [Phase.Prep]: '筹备期',
  [Phase.Warn]: '预警期',
  [Phase.Invade]: '入侵期',
  [Phase.Settle]: '清算期',
};

/** 地块类型 (美术文档 §2.1 四维定义法的通行/产出/战斗/视觉四问) */
export enum Tile {
  Plain = 0,
  Forest = 1,
  Ore = 2,
  Water = 3,
  Road = 4,
  Platform = 5,
  Polluted = 6,
  Wall = 7,
}

export const TILE_LABEL: Record<Tile, string> = {
  [Tile.Plain]: '平原',
  [Tile.Forest]: '林地',
  [Tile.Ore]: '矿脉',
  [Tile.Water]: '河流',
  [Tile.Road]: '道路',
  [Tile.Platform]: '高台',
  [Tile.Polluted]: '污染地',
  [Tile.Wall]: '墙障',
};

/** 实体种类 (渲染层据此选精灵) */
export enum EntityKind {
  Core = 'core',
  Tower = 'tower',
  Building = 'building',
  Human = 'human',
  Twisted = 'twisted',
  Xenogen = 'xenogen',
  Demonic = 'demonic',
  Automata = 'automata',
}

export interface Entity {
  id: number;
  kind: EntityKind;
  /** 地块坐标 (渲染层乘 tilePx) */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 地块/秒 */
  speed: number;
  /** 渲染层精灵 id (可选; 缺省按 kind 查表) */
  tex?: string;
}

export interface WorldSnapshot {
  tick: number;
  tiles: number[];
  entities: Entity[];
  coreHp: number;
  coreMaxHp: number;
  coreX: number;
  coreY: number;
  nextId: number;
}
