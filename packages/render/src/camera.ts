/**
 * Camera2D: 三层地图共用一套相机 (美术文档 §3.1: 0.5x-2x 缩放一套系统)
 * 世界容器挂 Camera.root, 相机负责 position/scale 与屏幕<->世界换算。
 */
import { Container } from 'pixi.js';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

export class Camera2D {
  readonly root = new Container();
  zoom = 1;
  /** 屏幕中心对应的世界坐标 (px) */
  centerX = 0;
  centerY = 0;
  screenW = 0;
  screenH = 0;
  /** 世界像素边界 (clamp 用) */
  worldW = 0;
  worldH = 0;

  setScreen(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
  }

  setWorld(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
  }

  centerOn(wx: number, wy: number): void {
    this.centerX = wx;
    this.centerY = wy;
  }

  /** 屏幕像素平移 (拖动) */
  panByScreen(dxPx: number, dyPx: number): void {
    this.centerX -= dxPx / this.zoom;
    this.centerY -= dyPx / this.zoom;
  }

  /** 以屏幕某点为中心缩放 (滚轮/双指) */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    this.centerX += before.x - after.x;
    this.centerY += before.y - after.y;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.screenW / 2) / this.zoom + this.centerX,
      y: (sy - this.screenH / 2) / this.zoom + this.centerY,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.centerX) * this.zoom + this.screenW / 2,
      y: (wy - this.centerY) * this.zoom + this.screenH / 2,
    };
  }

  /** 相机不飞出世界 (世界小于屏幕时居中) */
  clamp(): void {
    if (this.worldW <= 0 || this.worldH <= 0) return;
    const halfW = this.screenW / 2 / this.zoom;
    const halfH = this.screenH / 2 / this.zoom;
    this.centerX = this.worldW <= halfW * 2
      ? this.worldW / 2
      : Math.min(this.worldW - halfW, Math.max(halfW, this.centerX));
    this.centerY = this.worldH <= halfH * 2
      ? this.worldH / 2
      : Math.min(this.worldH - halfH, Math.max(halfH, this.centerY));
  }

  /** 把相机变换应用到容器 (每帧调用) */
  apply(): void {
    this.clamp();
    this.root.scale.set(this.zoom);
    this.root.position.set(
      this.screenW / 2 - this.centerX * this.zoom,
      this.screenH / 2 - this.centerY * this.zoom,
    );
  }
}
