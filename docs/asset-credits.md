# 黑雾城邦 · 美术资产来源登记 (CC0)

> 切片期所有第三方资产均为 **Kenney (kenney.nl) CC0 1.0** 许可 —— 公有领域 dedication,
> 允许商用/修改/再分发, 无需署名 (本文件为自愿登记, 便于正式版追溯)。
> 管线: `tools/process_art.py` (`pnpm art:process`) → `assets/` + `assets/manifest.json`。

## 已用于切片 (4 包)

| 源包 | 许可 | 管线用途 | 产物位置 |
| --- | --- | --- | --- |
| kenney_tower-defense-top-down | CC0 | @2x tilesheet 原生 128px 切地形/道路/树木/矿脉/绿地箭塔基座 | `assets/terrain/`, `assets/buildings/tower_arrow_01.png` |
| kenney_tiny-city | CC0 | 8x 缩放至 128px: 道路/城墙/树木变体 | `assets/terrain/` (road/wall/tree 系列) |
| kenney_roguelike-characters | CC0 | 8x 缩放至 128px 人类单位 + 暖调; magenta 行四阵营敌军 duotone 重染 | `assets/units/` (human_01-03 / enemy_*) |
| kenney_ui-pack | CC0 | Grey 变体 duotone 重调色为 Misthold 暗金主题 (骨白高光保留); Future 字体占位 | `assets/ui/gold/**` (164 项), `assets/ui/fonts/` |

## 重染/规格化规则 (美术文档 §1.5)

- **人类单位**: roguelike 8x → 128px + `warm_grade` 暖调 (全图唯一暖光源语言)。
- **四大阵营敌军**: magenta 行 duotone (亮度保持), 异绿/畸紫/魔红/机青 四色区分。
- **UI**: `#0F0C14` 暗底 → 描边金 duotone; 亮度 >200 的像素提亮为骨白。
- **地形**: TD @2x 原生 128px 直切 (1:1, 无缩放失真); tiny-city 8x → 128px。
- **id 规范**: 变体目录进 id (如 `ui.Default.arrow_basic_e` vs `ui.Double.arrow_basic_e`),
  manifest 写出前全局唯一性校验 (防贴图表静默丢资产)。

## 自产资产 (程序化生成, 无许可负担)

| 资产 | 生成方式 | 位置 |
| --- | --- | --- |
| 建筑 (民居/农场/伐木/矿场/城墙/辉光核心) | PIL 程序化绘制 128px | `assets/buildings/` |
| 黑雾/灰雾 (3+2 帧) | fbm 噪声 + 径向渐变 | `assets/fx/black_mist_*.png`, `gray_mist_*.png` |
| 辉光核心光圈 / 孢子 | 径向 glow / 高斯模糊椭圆 | `assets/fx/glow_core.png`, `spore.png` |
| design tokens | 美术文档 §1.2 全色板 | `assets/tokens/misthold.tokens.json` + `.css` + `packages/ui/src/theme/tokens.ts` |

## 预留未用 (2 包, 正式版 3D 化时启用)

| 源包 | 许可 | 状态 |
| --- | --- | --- |
| kenney_city-kit-commercial | CC0 | 3D 模型包, 切片为 2D 未接入; 正式版建筑 3D 化候选 |
| kenney_city-kit-industrial | CC0 | 同上 |

## 许可文本

各包 `License.txt` 随 `assets-raw/` 保留 (CC0 1.0 Universal)。
重染产物许可标注为 "CC0 + 自产重调色/重染" (manifest `license` 字段)。
