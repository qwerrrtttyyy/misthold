import { useHud } from '../store/hud-store';

/** 底部单位/技能条 (美术文档 §4.1: 选中单位指令 + 城邦技能; 入侵期切部署模式) */
export function UnitBar() {
  const { phase, enemyCount } = useHud();
  return (
    <div className="hud-panel unit-bar">
      <div className="unit-slot">民兵</div>
      <div className="unit-slot">步兵</div>
      <div className="unit-slot">狙击</div>
      <div className="unit-slot">工程</div>
      <div className="unit-slot">机甲</div>
      <div className="unit-slot">通灵</div>
      <span className="enemy-count">
        {phase === 'invade' ? `雾中敌军: ${enemyCount}` : '待命'}
      </span>
    </div>
  );
}
