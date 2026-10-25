/**
 * EventBus: 跨模块通信 (sim -> render/ui 投影的唯一通道)
 * 监听器抛错不影响其他监听器 (记入 console.error)。
 */

export type Listener<T> = (payload: T) => void;

export class EventBus<EventMap extends Record<string, unknown> = Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(type: K, fn: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(type, fn);
  }

  once<K extends keyof EventMap>(type: K, fn: Listener<EventMap[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof EventMap>(type: K, fn: Listener<EventMap[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;
    // 复制一份: 允许监听器在回调中 on/off; 调用前再查 Membership (回调中 off 的跳过)
    for (const fn of [...set]) {
      if (!this.listeners.get(type)?.has(fn)) continue;
      try {
        (fn as Listener<EventMap[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] listener error on "${String(type)}":`, err);
      }
    }
  }

  /** 测试/热替换用: 清空全部监听 */
  clear(): void {
    this.listeners.clear();
  }

  listenerCount(type: keyof EventMap): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}
