/**
 * ServiceLocator: 服务注册与查找 (renderer / storage / input / sim.world ...)
 * 重复注册同一 token 视为装配错误, 直接抛错 (技术文档 §3.3)。
 */

export type ServiceToken<T = unknown> = string | symbol | (new (...args: never[]) => T);

export class ServiceLocator {
  private registry = new Map<ServiceToken, unknown>();

  register<T>(token: ServiceToken<T>, instance: T): void {
    if (this.registry.has(token)) {
      throw new Error(`[ServiceLocator] duplicate registration: ${String(token)}`);
    }
    this.registry.set(token, instance);
  }

  get<T>(token: ServiceToken<T>): T {
    if (!this.registry.has(token)) {
      throw new Error(`[ServiceLocator] service not found: ${String(token)}`);
    }
    return this.registry.get(token) as T;
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    return this.registry.get(token) as T | undefined;
  }

  has(token: ServiceToken): boolean {
    return this.registry.has(token);
  }

  unregister(token: ServiceToken): void {
    this.registry.delete(token);
  }
}
