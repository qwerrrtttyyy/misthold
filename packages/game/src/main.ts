/**
 * 组装层入口 (技术文档 §3.5: game 注册模块 + 载入 data 配置 + 入口)
 * D1 冒烟 + D3 相机 + D6 周期状态机 + D7/D8 战斗闭环的最小装配。
 */
import { Kernel } from '@misthold/kernel';
import { RenderModule } from '@misthold/render';
import { UiModule } from '@misthold/ui';
import { DemoSimModule } from './modules/demo-sim.js';
import demoConfig from '../../../data/demo.json';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const hudRoot = document.getElementById('hud-root') as HTMLElement;

  const kernel = new Kernel();
  kernel.config.load(demoConfig);
  kernel.services.register('platform.canvas', canvas);

  // 注册三个模块 (render 依赖 sim.world 服务, 由 demo-sim 先注册 -> deps 拓扑保证)
  kernel.register(new RenderModule()).register(new UiModule()).register(new DemoSimModule());

  const order = await kernel.boot();
  console.info('[misthold] kernel booted, module order:', order.join(' -> '));

  // HUD 挂载 (React root)
  kernel.services.get<(el: HTMLElement) => void>('ui.mount')(hudRoot);
  document.getElementById('boot')?.classList.add('done');

  // cmd_* -> scheduler 接线 (组装层职责: UI 只发事件, 不碰 scheduler)
  const bus = kernel.events as unknown as {
    on: (t: string, fn: (payload: never) => void) => void;
  };
  bus.on('cmd_set_pause', (p: { paused: boolean }) => {
    kernel.scheduler.setPaused(p.paused);
    kernel.events.emit('paused_changed', { paused: p.paused });
  });
  bus.on('cmd_set_speed', (p: { speed: number }) => {
    kernel.scheduler.setTimeScale(p.speed);
    kernel.events.emit('speed_changed', { speed: p.speed });
  });

  kernel.scheduler.start();

  // 调试入口 (D10 验收/平衡调试)
  (window as unknown as { __misthold?: unknown }).__misthold = kernel;
}

main().catch((err) => {
  console.error('[misthold] boot failed:', err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = `启动失败: ${err instanceof Error ? err.message : String(err)}`;
});
