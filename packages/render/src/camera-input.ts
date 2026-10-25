/** 相机输入: 滚轮缩放 + 左键拖动 + 双指缩放/单指拖动 (技术文档 W1 D3, 美术文档 §4.1 移动端硬约束) */
import type { Camera2D } from './camera.js';

export function bindCameraInput(canvas: HTMLCanvasElement, camera: Camera2D): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const touches = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;

  /** 取两个触点 (双指) */
  const pinch = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
    const pts = [...touches.values()];
    const a = pts[0];
    const b = pts[1];
    return a && b ? [a, b] : null;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    camera.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const p = pinch();
        if (p) pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
      return;
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const p = pinch();
        if (!p) return;
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (pinchDist > 0 && d > 0) {
          const rect = canvas.getBoundingClientRect();
          camera.zoomAt(
            d / pinchDist,
            (p[0].x + p[1].x) / 2 - rect.left,
            (p[0].y + p[1].y) / 2 - rect.top,
          );
        }
        pinchDist = d;
      } else if (touches.size === 1) {
        // 单指拖动平移
        camera.panByScreen(e.movementX || 0, e.movementY || 0);
      }
      return;
    }
    if (!dragging) return;
    camera.panByScreen(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinchDist = 0;
      return;
    }
    dragging = false;
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  return () => {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };
}
