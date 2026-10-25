/**
 * 自研 seeded PRNG (技术文档 §2.1: 复用 mapgen v0.3.9 经验, xmur3/mulberry32 系)
 * 区块生成/波次变体可复现 (debug/测试需求, GDD §6.2)。
 */

/** 字符串 -> 32bit 种子 (xmur3) */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** 32bit 种子 -> [0,1) 均匀分布 (mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next01: () => number;

  constructor(seed: number | string) {
    const s = typeof seed === 'number' ? seed >>> 0 : xmur3(seed)();
    this.next01 = mulberry32(s);
  }

  next(): number {
    return this.next01();
  }

  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next01() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('[Rng] pick from empty array');
    return arr[this.int(0, arr.length - 1)]!;
  }

  chance(p: number): boolean {
    return this.next01() < p;
  }
}
