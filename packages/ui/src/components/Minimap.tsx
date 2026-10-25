import { Tile } from '@misthold/sim';
import { useHud } from '../store/hud-store';

const TILE_COLOR: Record<number, string> = {
  [Tile.Plain]: '#6b7a4f',
  [Tile.Forest]: '#3f5a33',
  [Tile.Ore]: '#7a6a52',
  [Tile.Water]: '#3d5a80',
  [Tile.Road]: '#8a7a5c',
  [Tile.Platform]: '#9b948b',
  [Tile.Polluted]: '#3b2a52',
  [Tile.Wall]: '#555049',
};

/** 小地图: 16x16 降采样 + 敌人红点 + 核心 (美术文档 §3.2: 固定右上, 点击跳转) */
export function Minimap() {
  const { minimap, phase } = useHud();
  const cell = (i: number) => {
    const t = minimap.tiles[i] ?? Tile.Plain;
    return TILE_COLOR[t] ?? '#222';
  };
  return (
    <div className="hud-panel minimap">
      <div className="minimap-title">小地图 · {phase === 'invade' ? '入侵中' : '安全'}</div>
      <div className="minimap-grid">
        {Array.from({ length: 256 }, (_, i) => (
          <div key={i} className="minimap-cell" style={{ background: cell(i) }} />
        ))}
      </div>
    </div>
  );
}
