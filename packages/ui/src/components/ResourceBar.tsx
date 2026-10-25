import { useHud, type AlertLevel, type Resources } from '../store/hud-store';

const RES_META: { key: keyof Resources; label: string }[] = [
  { key: 'food', label: '食物' },
  { key: 'wood', label: '木材' },
  { key: 'iron', label: '铁矿' },
  { key: 'metal', label: '精炼金属' },
];

/** 顶部资源栏 + 电力负载 (美术文档 §4.1: 只放关键资源, 速率箭头) */
export function ResourceBar() {
  const { resources, rates, power } = useHud();
  return (
    <div className="hud-panel resource-bar">
      {RES_META.map(({ key, label }) => (
        <div className="res-item" key={key}>
          <span className="res-name">{label}</span>
          <span className="res-value">{Math.floor(resources[key])}</span>
          <span className={`res-rate ${rates[key] < 0 ? 'down' : ''}`}>
            {rates[key] >= 0 ? '↑' : '↓'} {Math.abs(rates[key]).toFixed(1)}/s
          </span>
        </div>
      ))}
      <div className="res-item power-cell">
        <span className="res-name">电力</span>
        <span className="res-value">
          {power.gen}/{power.use}
        </span>
        <div className="power-bar">
          <div
            className="power-fill"
            style={{ width: `${Math.min(100, (power.use / Math.max(1, power.gen)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function AlertStack() {
  const { alerts, dismissAlert } = useHud();
  return (
    <div className="alert-stack">
      {alerts.map((a) => (
        <div key={a.id} className={`alert ${a.level}`} onClick={() => dismissAlert(a.id)}>
          [{a.level}] {a.text}
        </div>
      ))}
    </div>
  );
}

export function pushDemoAlert(level: AlertLevel, text: string) {
  useHud.getState().pushAlert(level, text);
}
