/** PixiJS 8 Application 工厂 (异步 init, 技术文档 §6 风险缓解: 只包基础件) */
import { Application } from 'pixi.js';

export async function createApp(canvas: HTMLCanvasElement, background = 0x0d0a14): Promise<Application> {
  const app = new Application();
  await app.init({
    canvas,
    background,
    antialias: false,
    resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
    autoDensity: true,
    // 跟随窗口尺寸 (手机横竖屏/桌面 resize): 否则 inline style 把画布钉死在初始 800x600
    resizeTo: window,
    powerPreference: 'high-performance',
  });
  return app;
}
