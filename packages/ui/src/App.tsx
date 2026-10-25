import { useHud } from './store/hud-store.js';
import { AlertStack, ResourceBar } from './components/ResourceBar.js';
import { CycleBar } from './components/CycleBar.js';
import { BuildMenu } from './components/BuildMenu.js';
import { Minimap } from './components/Minimap.js';
import { UnitBar } from './components/UnitBar.js';
import './hud.css';
import './theme/tokens.css';

/** HUD 根组件: 美术文档 §4.1 分区 + 阶段化雾晕 (§4.3) */
export function App() {
  const phase = useHud((s) => s.phase);
  return (
    <div className="hud-root">
      <div className={`hud-vignette ${phase}`} />
      <div className="hud-top">
        <ResourceBar />
        <CycleBar />
      </div>
      <BuildMenu />
      <Minimap />
      <AlertStack />
      <UnitBar />
    </div>
  );
}
