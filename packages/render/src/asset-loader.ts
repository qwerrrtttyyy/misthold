/**
 * 资产加载: 读 assets/manifest.json (tools/process_art.py 产物) -> Pixi Texture 表
 * manifest 是资产唯一索引 (id -> 相对路径 + 来源 + 许可 + 用途)。
 */
import { Assets, Texture } from 'pixi.js';

export interface ManifestEntry {
  id: string;
  file: string;
  px: [number, number] | null;
  source: string;
  license: string;
  usage: string;
}

export interface Manifest {
  categories: Record<string, ManifestEntry[]>;
}

export async function loadManifest(url = '/manifest.json'): Promise<Manifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[assets] manifest fetch failed: ${res.status}`);
  return (await res.json()) as Manifest;
}

/** manifest -> id->Texture (同名文件只加载一次) */
export async function loadTextures(manifest: Manifest): Promise<Map<string, Texture>> {
  const catalog = new Map<string, string>();
  for (const entries of Object.values(manifest.categories)) {
    for (const e of entries) if (e.file.endsWith('.png')) catalog.set(e.id, `/${e.file}`);
  }
  const out = new Map<string, Texture>();
  await Promise.all(
    [...catalog].map(async ([id, src]) => {
      const tex = await Assets.load(src);
      out.set(id, tex as Texture);
    }),
  );
  return out;
}

export function texOr(tex: Map<string, Texture>, id: string): Texture {
  const t = tex.get(id);
  if (!t) throw new Error(`[assets] missing texture: ${id}`);
  return t;
}
