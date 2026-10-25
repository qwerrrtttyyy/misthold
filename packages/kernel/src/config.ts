/**
 * ConfigStore: data/*.json 的只读视图 (改平衡不动代码, 技术文档 §3.1-5)
 * 支持点号路径: config.get<number>('towers.arrow.damage')
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    const prev = out[k];
    out[k] = isPlainObject(prev) && isPlainObject(v) ? deepMerge(prev, v) : v;
  }
  return out;
}

/** 'a.b' + {c:1} -> {a:{b:{c:1}}} */
function nest(prefix: string, section: Record<string, unknown>): Record<string, unknown> {
  const parts = prefix.split('.');
  let cur: Record<string, unknown> = section;
  for (const p of [...parts].reverse()) cur = { [p]: cur };
  return cur;
}

/** 递归深冻结: 配置载入后真正不可变 (模块误写会直接抛错, 而不是静默腐蚀共享状态) */
function deepFreeze(v: unknown): void {
  if (typeof v !== 'object' || v === null || Object.isFrozen(v)) return;
  Object.freeze(v);
  for (const inner of Object.values(v as Record<string, unknown>)) deepFreeze(inner);
}

export class ConfigStore {
  private data: Record<string, unknown> = {};

  /**
   * 载入一个 JSON 对象 (可多次调用深合并; prefix 为命名空间)
   * 防御性深拷贝 + 深冻结: 调用方改原对象不污染 store, 模块也不能通过
   * require() 拿到的引用反向改写配置 (配置是静态平衡数据, 不是运行时状态)。
   */
  load(section: Record<string, unknown>, prefix = ''): void {
    const cloned = structuredClone(section);
    const incoming = prefix ? nest(prefix, cloned) : cloned;
    this.data = deepMerge(this.data, incoming);
    deepFreeze(this.data);
  }

  get<T>(path: string): T | undefined {
    const parts = path.split('.');
    let cur: unknown = this.data;
    for (const p of parts) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur as T | undefined;
  }

  /** 取值失败直接抛错 (关键配置不允许静默缺失) */
  require<T>(path: string): T {
    const v = this.get<T>(path);
    if (v === undefined) {
      throw new Error(`[ConfigStore] missing required config: ${path}`);
    }
    return v;
  }

  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  snapshot(): Record<string, unknown> {
    return structuredClone(this.data);
  }
}
