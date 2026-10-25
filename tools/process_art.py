#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""黑雾城邦 美术资产管线 v0.1
输入: assets-raw/ 下 6 个 Kenney CC0 原始解包
输出: assets/ 下切片规格资产 + manifest.json + tokens
规格依据: 美术文档 §1.5 (tile 128px / unit 128px / building 128px 切片占位, 正式 256px)
色板依据: 美术文档 §1.2
运行: python3 tools/process_art.py
"""
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw"
OUT = ROOT / "assets"
TD2X = RAW / "tower-defense-top-down" / "Tilesheet" / "towerDefense_tilesheet@2.png"
TINY = RAW / "tiny-city" / "Tiles"
ROGUE_MAGENTA = RAW / "roguelike-characters" / "Spritesheet" / "roguelikeChar_magenta.png"
ROGUE_TRANS = RAW / "roguelike-characters" / "Spritesheet" / "roguelikeChar_transparent.png"
UI_GREY = RAW / "ui-pack" / "PNG" / "Grey"

# ---- 色板 (美术文档 §1.2) ----
PAL = {
    "human_amber": "#E8A33D", "human_lamp": "#F26B3A", "human_cloth": "#8C6A4F",
    "human_lime": "#9B948B", "human_glow": "#FFD98C",
    "xeno_acid": "#8BC34A", "xeno_indigo": "#6A3D9A", "xeno_goo": "#B7F04A",
    "twist_rot": "#7A5B43", "twist_rash": "#D98324", "twist_blood": "#A83731",
    "demon_red": "#C0392B", "demon_black": "#1C1616", "demon_bone": "#E8DFC8",
    "auto_steel": "#5B7A99", "auto_warn": "#F2C230", "auto_cyan": "#4FD1C5",
    "bfog_core": "#0D0A14", "bfog_edge": "#3B2A52", "bfog_bolt": "#8E5BC0",
    "gfog_grey": "#8A9391", "gfog_deep": "#5E6B6A", "gfog_shade": "#2E3634",
    "ui_bg": "#1A161E", "ui_gold": "#C9A86A", "ui_ok": "#6FB36A",
    "ui_danger": "#D8443C", "ui_taboo": "#B03A6E",
}

def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))

# ---- 基础工具 ----
_ts2x = None
def td_tile(idx: int) -> Image.Image:
    """TD @2x tilesheet 取 128px tile, idx 从 1 开始, 23 列"""
    global _ts2x
    if _ts2x is None:
        _ts2x = Image.open(TD2X).convert("RGBA")
    t = 128
    col, row = (idx - 1) % 23, (idx - 1) // 23
    return _ts2x.crop((col * t, row * t, (col + 1) * t, (row + 1) * t))

def tiny_tile(idx: int, scale: int = 8) -> Image.Image:
    """tiny-city 16px tile -> 128px 最近邻放大"""
    p = TINY / f"tile_{idx:04d}.png"
    im = Image.open(p).convert("RGBA")
    return im.resize((16 * scale, 16 * scale), Image.NEAREST)

def save(im: Image.Image, rel: str):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p)
    return rel

def duotone(im: Image.Image, dark, light) -> Image.Image:
    """亮度保持的双色重染 (单色剪影 -> 阵营色)"""
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255.0
    d = np.array(dark, dtype=np.float32)
    l = np.array(light, dtype=np.float32)
    out = d[None, None, :] * (1 - lum[..., None]) + l[None, None, :] * lum[..., None]
    out = np.concatenate([out, a[..., 3:4]], axis=-1).astype(np.uint8)
    return Image.fromarray(out, "RGBA")

def warm_grade(im: Image.Image, strength: float = 0.22) -> Image.Image:
    """向人类琥珀色轻微暖调 (只作用于有像素处)"""
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    amber = np.array(hx(PAL["human_amber"]), dtype=np.float32)
    alpha = a[..., 3:4] / 255.0
    a[..., :3] = a[..., :3] * (1 - strength * alpha) + amber[None, None, :] * (strength * alpha)
    return Image.fromarray(a.astype(np.uint8), "RGBA")

def upscale_nearest(im: Image.Image, size: int = 128) -> Image.Image:
    w, h = im.size
    s = max(1, round(size / max(w, h)))
    return im.resize((w * s, h * s), Image.NEAREST)

# ---- 程序化纹理 ----
def fbm_cloud(size: int, seed: int, octaves: int = 4) -> np.ndarray:
    """分形值噪声, 返回 [0,1] 二维数组"""
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size), dtype=np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        res = 4 * (2 ** o)
        grid = rng.random((res, res)).astype(np.float32)
        im = Image.fromarray((grid * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
        out += amp * (np.asarray(im).astype(np.float32) / 255.0)
        total += amp
        amp *= 0.55
    return out / total

def cloud_sprite(size: int, seed: int, base, edge, alpha_max: int = 235) -> Image.Image:
    n = fbm_cloud(size, seed)
    n = (n - n.min()) / (n.max() - n.min() + 1e-6)
    # 云团对比曲线 + 径向衰减
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.sqrt(((xx - size / 2) / (size / 2)) ** 2 + ((yy - size / 2) / (size / 2)) ** 2)
    radial = np.clip(1.25 - r, 0, 1) ** 1.6
    density = np.clip(n * 1.5 - 0.28, 0, 1) * radial
    base_c, edge_c = np.array(hx(base), dtype=np.float32), np.array(hx(edge), dtype=np.float32)
    lum = density[..., None]
    rgb = base_c[None, None, :] * (1 - lum) + edge_c[None, None, :] * lum
    alpha = (density * alpha_max).astype(np.uint8)
    out = np.concatenate([rgb, alpha[..., None]], axis=-1).astype(np.uint8)
    return Image.fromarray(out, "RGBA")

def glow_sprite(size: int, inner, mid, outer) -> Image.Image:
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.sqrt(((xx - size / 2) / (size / 2)) ** 2 + ((yy - size / 2) / (size / 2)) ** 2)
    r = np.clip(r, 0, 1)
    c_in, c_mid, c_out = (np.array(hx(c), dtype=np.float32) for c in (inner, mid, outer))
    t1, t2 = np.clip(r / 0.35, 0, 1)[..., None], np.clip((r - 0.35) / 0.65, 0, 1)[..., None]
    rgb = c_in[None, None, :] * (1 - t1) + c_mid[None, None, :] * t1
    rgb = rgb * (1 - t2) + c_out[None, None, :] * t2
    alpha = (np.clip(1.15 - r * 1.15, 0, 1) ** 1.4 * 255).astype(np.uint8)
    out = np.concatenate([rgb, alpha[..., None]], axis=-1).astype(np.uint8)
    return Image.fromarray(out, "RGBA")

# ---- 程序化建筑 (切片占位, 人类文明暖色灯火) ----
def _outline(d, box, color, w=3):
    d.rectangle(box, outline=color, width=w)

def draw_farm() -> Image.Image:
    im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([8, 8, 120, 120], fill=hx("#6B4F33") + (255,))          # 耕地
    for i in range(5):                                                 # 垄沟
        y = 26 + i * 18
        d.line([(22, y), (106, y)], fill=hx("#543d28") + (255,), width=4)
    d.rectangle([44, 40, 84, 88], fill=hx(PAL["human_cloth"]) + (255,), outline=hx("#3d2c20") + (255,), width=3)  # 谷仓
    d.polygon([(40, 40), (64, 18), (88, 40)], fill=hx(PAL["demon_red"]) + (255,), outline=hx("#3d2c20") + (255,))
    d.rectangle([58, 66, 70, 88], fill=hx(PAL["human_glow"]) + (255,))  # 暖灯门
    return im

def draw_lumber() -> Image.Image:
    im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([8, 8, 120, 120], fill=hx("#5d5138") + (255,))
    for i, (x, y) in enumerate([(30, 70), (30, 58), (30, 46)]):         # 原木堆
        d.rounded_rectangle([x, y, x + 58, y + 11], 5, fill=hx(PAL["human_cloth"]) + (255,), outline=hx("#3d2c20") + (255,), width=2)
        d.ellipse([x + 2, y + 1, x + 10, y + 9], fill=hx("#c9b48c") + (255,))
    d.rectangle([74, 30, 108, 62], fill=hx("#7a6a4f") + (255,), outline=hx("#3d2c20") + (255,), width=3)  # 木屋
    d.polygon([(70, 30), (91, 14), (112, 30)], fill=hx("#5a4a33") + (255,))
    d.rectangle([84, 42, 98, 62], fill=hx(PAL["human_glow"]) + (255,))  # 暖灯窗
    d.rectangle([26, 88, 46, 108], fill=hx("#8a6b4a") + (255,), outline=hx("#3d2c20") + (255,), width=2)  # 树桩
    d.ellipse([26, 88, 46, 100], fill=hx("#a8855c") + (255,))
    return im

def draw_quarry() -> Image.Image:
    im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([10, 10, 118, 118], fill=hx("#6e6a63") + (255,))
    d.ellipse([34, 34, 94, 94], fill=hx("#4a463f") + (255,))            # 矿坑
    for (x, y, r) in [(24, 88, 12), (96, 30, 10), (88, 96, 9), (30, 26, 8)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=hx("#8d8880") + (255,), outline=hx("#4a463f") + (255,), width=2)
    d.line([(64, 96), (64, 30)], fill=hx("#3a352e") + (255,), width=5)  # 吊架
    d.line([(64, 34), (44, 60)], fill=hx("#3a352e") + (255,), width=4)
    d.line([(64, 34), (84, 60)], fill=hx("#3a352e") + (255,), width=4)
    d.rectangle([40, 58, 50, 70], fill=hx("#77726a") + (255,), outline=hx("#3a352e") + (255,), width=2)  # 石料
    return im

def draw_mine() -> Image.Image:
    im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([8, 8, 120, 120], fill=hx("#5a5348") + (255,))
    d.polygon([(28, 96), (44, 26), (60, 26), (76, 96)], fill=hx(PAL["human_cloth"]) + (255,), outline=hx("#2e2820") + (255,))  # 井架
    d.line([(44, 26), (76, 96)], fill=hx("#2e2820") + (255,), width=3)
    d.line([(60, 26), (28, 96)], fill=hx("#2e2820") + (255,), width=3)
    d.line([(52, 26), (52, 96)], fill=hx("#2e2820") + (255,), width=3)
    d.ellipse([40, 8, 64, 26], fill=hx(PAL["human_lamp"]) + (255,), outline=hx("#2e2820") + (255,), width=2)  # 顶端灯
    d.rounded_rectangle([82, 74, 110, 94], 6, fill=hx("#6b5a3f") + (255,), outline=hx("#2e2820") + (255,), width=2)  # 矿车
    d.ellipse([86, 90, 94, 98], fill=hx("#2e2820") + (255,))
    d.ellipse([98, 90, 106, 98], fill=hx("#2e2820") + (255,))
    return im

def draw_house() -> Image.Image:
    im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([10, 10, 118, 118], fill=hx("#5f7a52") + (255,))
    d.rectangle([36, 48, 92, 96], fill=hx(PAL["human_cloth"]) + (255,), outline=hx("#3d2c20") + (255,), width=3)
    d.polygon([(30, 48), (64, 20), (98, 48)], fill=hx("#7a4a3a") + (255,), outline=hx("#3d2c20") + (255,))
    d.rectangle([44, 62, 60, 80], fill=hx(PAL["human_glow"]) + (255,))   # 暖灯窗
    d.rectangle([70, 62, 84, 80], fill=hx(PAL["human_glow"]) + (180,))
    d.rectangle([54, 82, 74, 96], fill=hx("#4a3428") + (255,))           # 门
    return im

def draw_core(state: str = "normal") -> Image.Image:
    """辉光核心: 全图唯一暖光源 (美术文档 §1.4)"""
    im = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base = hx("#3a3f4a") if state == "normal" else hx("#2c2026")
    d.ellipse([16, 16, 112, 112], fill=base + (255,), outline=hx("#14161c") + (255,), width=4)
    for i in range(8):                                                    # 基座翼片
        ang = i * math.pi / 4
        x1, y1 = 64 + 44 * math.cos(ang), 64 + 44 * math.sin(ang)
        x2, y2 = 64 + 52 * math.cos(ang + 0.3), 64 + 52 * math.sin(ang + 0.3)
        d.line([(x1, y1), (x2, y2)], fill=hx(PAL["auto_steel"]) + (255,), width=6)
    d.ellipse([34, 34, 94, 94], fill=hx("#14161c") + (255,))
    core = hx(PAL["human_glow"]) if state == "normal" else hx(PAL["ui_danger"])
    d.ellipse([42, 42, 86, 86], fill=core + (255,))
    d.ellipse([52, 52, 76, 76], fill=(255, 255, 255, 255))
    if state == "damaged":
        d.line([(30, 40), (52, 62), (40, 88)], fill=hx("#141014") + (255,), width=4)
        d.line([(98, 36), (76, 60), (92, 84)], fill=hx("#141014") + (255,), width=4)
    return im

# ---- 主流程 ----
def main():
    # 注意: rmtree 全删重建会使 vite dev 的 publicDir(sirv) 缓存陈化 ->
    # 资产请求落入 SPA fallback 返回 index.html。重跑本脚本后必须重启 dev server。
    if OUT.exists():
        shutil.rmtree(OUT)
    manifest = {"generated_by": "tools/process_art.py v0.1", "spec": {"tile_px": 128, "unit_px": 128, "building_px": 128, "note": "building 128px 为切片占位, 正式版按美术文档 §1.5 为 256px 三阶段"}, "categories": {}}
    def add(cat, entry):
        manifest["categories"].setdefault(cat, []).append(entry)

    # 1. 地形 (TD @2x, 原生 128px)
    terrain_map = {
        "grass": [1, 2, 3, 4], "grass_blend": [5, 6, 7, 8],
        "path": [24, 25, 26, 27, 28], "path_blend": [29, 30, 31, 32, 33],
        "tree_big": [75, 76], "tree_small": [34, 35, 36, 37],
        "rock": [54, 55, 56, 57, 59, 60, 61, 62, 63],
        "water": [124, 125, 126, 132, 133],
        "platform": [181, 182, 183],           # 可建造平台砖(独立PNG核实)
    }
    for name, idxs in terrain_map.items():
        for i, idx in enumerate(idxs, 1):
            rel = save(td_tile(idx), f"tiles/terrain/{name}_{i:02d}.png")
            add("terrain", {"id": f"terrain.{name}_{i:02d}", "file": rel, "px": [128, 128],
                            "source": f"kenney_tower-defense-top-down tilesheet@2x #{idx:03d}", "license": "CC0",
                            "usage": "D3 地块网格"})
    # 污染地: 草地双色重染 (自产, 美术文档: 黑斑地面)
    for i, idx in enumerate([1, 2, 3, 4], 1):
        polluted = duotone(td_tile(idx), hx("#17101F"), hx("#5A3A68"))
        dd = ImageDraw.Draw(polluted)
        dd.ellipse([30, 40, 60, 70], fill=hx("#241630") + (220,))
        dd.ellipse([70, 70, 95, 95], fill=hx("#241630") + (200,))
        rel = save(polluted, f"tiles/terrain/polluted_{i:02d}.png")
        add("terrain", {"id": f"terrain.polluted_{i:02d}", "file": rel, "px": [128, 128],
                        "source": f"duotone(td_tilesheet@2x #{idx:03d}, 雾缘紫)", "license": "CC0 + 自产重染",
                        "usage": "黑雾侵蚀战后污染地 (美术文档 §2.2)"})
    # 道路/城墙/树 (tiny-city, x8)
    for i, idx in enumerate([1, 2, 5, 6], 1):
        rel = save(tiny_tile(idx), f"tiles/terrain/road_{i:02d}.png")
        add("terrain", {"id": f"terrain.road_{i:02d}", "file": rel, "px": [128, 128],
                        "source": f"kenney_tiny-city tile_{idx:04d} x8", "license": "CC0", "usage": "道路地块"})
    for i, idx in enumerate([97, 98, 99, 100, 101, 102, 103], 1):
        rel = save(tiny_tile(idx), f"buildings/wall_{i:02d}.png")
        add("buildings", {"id": f"building.wall_{i:02d}", "file": rel, "px": [128, 128],
                          "source": f"kenney_tiny-city tile_{idx:04d} x8", "license": "CC0", "usage": "城墙/路障占位"})
    for i, idx in enumerate([52, 53, 65, 66, 67, 68], 1):
        rel = save(tiny_tile(idx), f"tiles/terrain/citytree_{i:02d}.png")
        add("terrain", {"id": f"terrain.citytree_{i:02d}", "file": rel, "px": [128, 128],
                        "source": f"kenney_tiny-city tile_{idx:04d} x8", "license": "CC0", "usage": "林地树木占位"})

    # 2. 防御塔与道具 (TD @2x)
    rel = save(td_tile(192), "buildings/tower_arrow_01.png")
    add("buildings", {"id": "building.tower_arrow_01", "file": rel, "px": [128, 128],
                      "source": "kenney_tower-defense-top-down tilesheet@2x #192 (绿圆塔)", "license": "CC0",
                      "usage": "D8 箭塔占位; 正式塔按美术文档 §1.3 人类形状语言自产"})
    for name, idx in [("coin_gold", 272), ("coin_ring", 273), ("coin_bronze", 274),
                      ("plane_green", 270), ("plane_gray", 271)]:
        cat = "props" if "coin" in name else "units"
        rel = save(td_tile(idx), f"{cat}/{name}.png")
        add(cat, {"id": f"{cat[:-1]}.{name}", "file": rel, "px": [128, 128],
                  "source": f"kenney_tower-defense-top-down tilesheet@2x #{idx:03d}", "license": "CC0",
                  "usage": "战利品/空军敌人占位"})

    # 3. 单位 (roguelike 16px -> 128px 最近邻)
    mag = Image.open(ROGUE_MAGENTA).convert("RGBA")
    trans = Image.open(ROGUE_TRANS).convert("RGBA")
    def rogue_tile(im, row, col):
        x, y = col * 17, row * 17
        return im.crop((x, y, x + 16, y + 16))
    mag_colors = {}
    a = np.asarray(mag)
    opaque = a[a[..., 3] > 200]
    if len(opaque):
        mag_colors["top"] = [tuple(int(v) for v in c) for c in
                             np.unique(opaque[:, :3].reshape(-1, 3), axis=0)[:6]]
    # 人类: 透明版自然色 + 暖调
    for r in range(6):
        u = warm_grade(upscale_nearest(rogue_tile(trans, r, 0)))
        rel = save(u, f"units/human_{r + 1:02d}.png")
        add("units", {"id": f"unit.human_{r + 1:02d}", "file": rel, "px": [128, 128],
                      "source": f"kenney_roguelike-characters col0 row{r} x8 + 暖调", "license": "CC0",
                      "usage": "民兵/步兵/远征队占位 (D7)"})
    # 敌军阵营: magenta 单色版 -> 双色重染
    factions = {
        "xenogen": (PAL["xeno_acid"], "异源体-酸绿", "D7 变异体占位(近位)"),
        "twisted": (PAL["twist_rot"], "变异体-腐褐", "D7 腐狼占位"),
        "demonic": (PAL["demon_red"], "魔族-猩红", "魔族占位"),
    }
    for fname, (color, label, usage) in factions.items():
        c = hx(color)
        dark = tuple(int(v * 0.30) for v in c)
        light = tuple(min(255, int(v * 1.25)) for v in c)
        for r in range(3):
            e = duotone(upscale_nearest(rogue_tile(mag, r, 0)), dark, light)
            rel = save(e, f"units/enemy_{fname}_{r + 1:02d}.png")
            add("units", {"id": f"unit.enemy_{fname}_{r + 1:02d}", "file": rel, "px": [128, 128],
                          "source": f"kenney_roguelike-characters magenta col0 row{r} duotone({label})", "license": "CC0 + 自产重染",
                          "usage": usage})

    # 4. 程序化建筑 (人类文明)
    builders = {"farm": draw_farm, "lumber": draw_lumber, "quarry": draw_quarry,
                "mine": draw_mine, "house": draw_house}
    for name, fn in builders.items():
        rel = save(fn(), f"buildings/{name}.png")
        add("buildings", {"id": f"building.{name}", "file": rel, "px": [128, 128],
                          "source": "procedural PIL (tools/process_art.py)", "license": "自产",
                          "usage": "D4 采集/工业/民生建筑占位; 正式版走 Blender->精灵管线"})
    rel = save(draw_core("normal"), "buildings/glow_core_normal.png")
    add("buildings", {"id": "building.glow_core_normal", "file": rel, "px": [128, 128],
                      "source": "procedural PIL", "license": "自产",
                      "usage": "辉光核心(被毁即失败); 全图唯一暖光源"})
    rel = save(draw_core("damaged"), "buildings/glow_core_damaged.png")
    add("buildings", {"id": "building.glow_core_damaged", "file": rel, "px": [128, 128],
                      "source": "procedural PIL", "license": "自产", "usage": "核心受损状态(光源闪烁变红)"})

    # 5. FX 纹理 (黑雾/灰雾/辉光/孢子)
    for i, seed in enumerate([11, 29, 47], 1):
        rel = save(cloud_sprite(512, seed, PAL["bfog_core"], PAL["bfog_edge"]), f"fx/black_mist_{i}.png")
        add("fx", {"id": f"fx.black_mist_{i}", "file": rel, "px": [512, 512],
                   "source": "procedural fbm cloud (雾芯#0D0A14/雾缘#3B2A52)", "license": "自产",
                   "usage": "D6 黑雾体积雾占位; 正式为 Pixi 自定义 shader pass"})
    for i, seed in enumerate([5, 23], 1):
        rel = save(cloud_sprite(512, seed, PAL["gfog_deep"], PAL["gfog_grey"], 190), f"fx/gray_mist_{i}.png")
        add("fx", {"id": f"fx.gray_mist_{i}", "file": rel, "px": [512, 512],
                   "source": "procedural fbm cloud (灰青#8A9391)", "license": "自产", "usage": "灰雾探索层占位"})
    rel = save(glow_sprite(512, PAL["human_glow"], PAL["human_lamp"], "#201408"), "fx/glow_core.png")
    add("fx", {"id": "fx.glow_core", "file": rel, "px": [512, 512],
               "source": "procedural radial glow (辉光金->灯火橙)", "license": "自产",
               "usage": "辉光核心光圈/前哨暖光/远征队头灯"})
    spore = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    sd = ImageDraw.Draw(spore)
    sd.ellipse([8, 8, 24, 24], fill=hx(PAL["xeno_goo"]) + (230,))
    spore = spore.filter(ImageFilter.GaussianBlur(2))
    rel = save(spore, "fx/spore.png")
    add("fx", {"id": "fx.spore", "file": rel, "px": [32, 32], "source": "procedural", "license": "自产",
               "usage": "污染地孢子粒子"})

    # 6. UI 重调色 (Grey -> Misthold 暗金)
    n_ui = 0
    for src in sorted(UI_GREY.rglob("*.png")):
        rel_name = src.relative_to(RAW / "ui-pack" / "PNG").as_posix()
        im = Image.open(src).convert("RGBA")
        themed = duotone(im, hx("#0F0C14"), hx(PAL["ui_gold"]))
        # 保留少量原始高光 -> 骨白提亮
        arr = np.asarray(themed).astype(np.float32)
        lum = (0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2])
        bone = np.array(hx(PAL["demon_bone"]), dtype=np.float32)
        mask = (lum > 200) & (arr[..., 3] > 200)
        arr[mask, :3] = bone[None, :]
        themed = Image.fromarray(arr.astype(np.uint8), "RGBA")
        rel = save(themed, f"ui/gold/{rel_name}")
        # id 必须含变体目录 (Grey/Default 与 Grey/Double 同名文件会撞车)
        variant = src.relative_to(UI_GREY).with_suffix("").as_posix().replace("/", ".")
        add("ui", {"id": "ui." + variant, "file": rel, "px": list(im.size),
                   "source": f"kenney_ui-pack Grey/{rel_name} duotone(暗底->描边金)", "license": "CC0 + 自产重调色",
                   "usage": "D4-D5 React HUD / 9-slice 面板"})
        n_ui += 1
    fonts = ROOT / "assets" / "ui" / "fonts"
    fonts.mkdir(parents=True, exist_ok=True)
    for f in (RAW / "ui-pack" / "Font").glob("*.ttf"):
        shutil.copy(f, fonts / f.name)
        add("ui", {"id": "ui.font." + f.stem, "file": f"ui/fonts/{f.name}", "px": None,
                   "source": "kenney_ui-pack Font", "license": "CC0", "usage": "HUD 占位字体(正式版换末世气质字体)"})

    # 7. design tokens
    tokens = {"color": {}, "font": {"family": {"value": "'Kenney Future', system-ui, sans-serif", "type": "fontFamily"}}}
    groups = {
        "human": {k: v for k, v in PAL.items() if k.startswith("human_")},
        "faction_xenogen": {k: v for k, v in PAL.items() if k.startswith("xeno_")},
        "faction_twisted": {k: v for k, v in PAL.items() if k.startswith("twist_")},
        "faction_demonic": {k: v for k, v in PAL.items() if k.startswith("demon_")},
        "faction_automata": {k: v for k, v in PAL.items() if k.startswith("auto_")},
        "fog_black": {k: v for k, v in PAL.items() if k.startswith("bfog_")},
        "fog_gray": {k: v for k, v in PAL.items() if k.startswith("gfog_")},
        "ui": {k: v for k, v in PAL.items() if k.startswith("ui_")},
    }
    for g, kv in groups.items():
        tokens["color"][g] = {k: {"value": v, "type": "color"} for k, v in kv.items()}
    tok_path = OUT / "tokens" / "misthold.tokens.json"
    tok_path.parent.mkdir(parents=True, exist_ok=True)
    tok_path.write_text(json.dumps(tokens, ensure_ascii=False, indent=2), encoding="utf-8")
    add("tokens", {"id": "tokens.misthold", "file": "tokens/misthold.tokens.json", "px": None,
                   "source": "美术文档 §1.2 色板", "license": "自产", "usage": "全项目色彩基准(W3C design tokens)"})

    # 7b. tokens.css + tokens.ts (供 ui 包直接 import)
    css = [":root {"]
    for g, kv in groups.items():
        for k, v in kv.items():
            css.append(f"  --mh-{g.replace('_', '-')}-{k.split('_', 1)[1]}: {v};")
    css.append("  --mh-font: 'Kenney Future', system-ui, sans-serif;")
    css.append("}")
    (OUT / "tokens" / "tokens.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    ts = ["// AUTO-GENERATED by tools/process_art.py - 美术文档 §1.2 色板", "export const tokens = {"]
    for g, kv in groups.items():
        ts.append(f"  {g}: {{")
        for k, v in kv.items():
            ts.append(f"    {k}: '{v}',")
        ts.append("  },")
    ts.append("} as const;")
    ts.append("export type TokenGroup = keyof typeof tokens;")
    ui_theme = ROOT / "packages" / "ui" / "src" / "theme"
    ui_theme.mkdir(parents=True, exist_ok=True)
    (ui_theme / "tokens.ts").write_text("\n".join(ts) + "\n", encoding="utf-8")
    (ui_theme / "tokens.css").write_text("\n".join(css) + "\n", encoding="utf-8")

    # 全局唯一性校验: id 撞车会让 loadTextures 按 id 去重时静默丢资产
    seen_ids: dict[str, str] = {}
    for cat, entries in manifest["categories"].items():
        for e in entries:
            if e["id"] in seen_ids and seen_ids[e["id"]] != e["file"]:
                raise SystemExit(
                    f"[process_art] FATAL: manifest id 撞车 {e['id']}: "
                    f"{seen_ids[e['id']]} vs {e['file']} ({cat})"
                )
            seen_ids[e["id"]] = e["file"]

    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(len(v) for v in manifest["categories"].values())
    print(f"OK assets -> {OUT}")
    print(f"manifest entries: {total}  categories: { {k: len(v) for k, v in manifest['categories'].items()} }")
    print(f"ui themed: {n_ui}, magenta sample colors: {mag_colors.get('top')}")

if __name__ == "__main__":
    main()
