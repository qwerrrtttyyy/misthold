import { Phase, PHASE_LABEL } from '@misthold/sim';
import { cmd, sendCmd, useHud } from '../store/hud-store';

/** 周期条: 阶段徽标 + 倒计时 + 核心 HP + 暂停/速度 (美术文档 §4.1/§4.3) */
export function CycleBar() {
  const { day, phase, countdownS, coreHp, coreMaxHp, paused, speed } = useHud();
  const mm = String(Math.floor(countdownS / 60)).padStart(2, '0');
  const ss = String(Math.floor(countdownS % 60)).padStart(2, '0');
  return (
    <div className="hud-panel cycle-bar">
      <span className="day-label">第 {day} 日</span>
      <span className={`phase-badge ${phase}`}>{PHASE_LABEL[phase as Phase]}</span>
      <span className="countdown">
        {mm}:{ss}
      </span>
      <div className="core-hp">
        <div className="res-name" style={{ fontSize: 10 }}>
          辉光核心 {Math.max(0, Math.ceil(coreHp))}/{coreMaxHp}
        </div>
        <div className="core-hp-bar">
          <div className="core-hp-fill" style={{ width: `${(coreHp / coreMaxHp) * 100}%` }} />
        </div>
      </div>
      <div className="clock-controls">
        <button
          className={`clock-btn ${paused ? 'active' : ''}`}
          onClick={() => sendCmd(cmd.setPause(!paused))}
          title="暂停/继续 (空格)"
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button className={`clock-btn ${speed === 1 ? '' : 'active'}`} onClick={() => sendCmd(cmd.setSpeed(1))} title="常速">
          1×
        </button>
        <button className={`clock-btn ${speed === 2 ? 'active' : ''}`} onClick={() => sendCmd(cmd.setSpeed(2))} title="双倍速">
          2×
        </button>
      </div>
    </div>
  );
}
