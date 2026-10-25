"""黑雾城邦 P0 切片 · 交互闭环验证 (验收标准 #2)
真实点击: 选卡 -> 地图点击建塔 -> 资源扣除/实体增加/告警;
暂停按钮 -> 倒计时冻结 (验证 CycleBar 走总线的修复);
fps 采样 (沙箱 SwiftShader 软渲染, 数字仅参考)。
"""
import asyncio
import sys

from playwright.async_api import async_playwright

URL = "http://localhost:5173/"


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
        )
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_function(
            "() => document.getElementById('hud-root')?.children.length > 0", timeout=30000
        )
        await page.wait_for_timeout(1500)

        # ---- 1. 建塔闭环 ----
        wood_before = int(await page.text_content(".res-item:nth-child(2) .res-value"))
        towers_before = await page.evaluate(
            "() => window.__misthold.services.get('sim.world').ofKind('tower').length"
        )

        # 切到防御 Tab (第 4 个) 并点箭塔卡
        await page.click(".build-tab:nth-child(4)")
        await page.wait_for_timeout(200)
        card_active = await page.evaluate(
            "() => !!document.querySelector('.build-card.active')"
        )
        await page.click(".build-cards .build-card:nth-child(1)")  # 箭塔
        await page.wait_for_timeout(200)
        ghost_on = await page.evaluate(
            "() => document.querySelector('.build-card.active')?.textContent?.includes('箭塔') ?? false"
        )

        # 画布点击: 用 render.camera 服务精确换算 tile(30,31) -> 屏幕坐标
        cam = await page.evaluate(
            """() => { const c = window.__misthold.services.get('render.camera');
                      return { zoom: c.zoom, cx: c.centerX, cy: c.centerY, w: c.screenW, h: c.screenH }; }"""
        )
        box = await page.evaluate(
            """() => { const r = document.getElementById('game-canvas').getBoundingClientRect();
                      return { x: r.left, y: r.top, w: r.width, h: r.height }; }"""
        )
        tx, ty = 30, 31  # 演示塔 (29/35,29/35) 与核心 (32,32) 之间的空格
        wx, wy = (tx + 0.5) * 128, (ty + 0.5) * 128
        sx = (wx - cam["cx"]) * cam["zoom"] + cam["w"] / 2
        sy = (wy - cam["cy"]) * cam["zoom"] + cam["h"] / 2
        await page.mouse.click(box["x"] + sx, box["y"] + sy)
        await page.wait_for_timeout(600)

        wood_after = int(await page.text_content(".res-item:nth-child(2) .res-value"))
        towers_after = await page.evaluate(
            "() => window.__misthold.services.get('sim.world').ofKind('tower').length"
        )
        alerts = await page.evaluate(
            "() => [...document.querySelectorAll('.alert')].map(e => e.textContent.trim())"
        )
        build_ok = any("已建造 箭塔" in a for a in alerts)

        print("=== 1. 建塔闭环 ===")
        print(f"  卡片激活态: card_active={card_active} ghost_label={ghost_on}")
        print(f"  木材: {wood_before} -> {wood_after} (期望 -30)")
        print(f"  箭塔数: {towers_before} -> {towers_after} (期望 +1)")
        print(f"  告警: {alerts[-3:]}")
        print(f"  建造成功: {'OK' if build_ok else 'FAIL'}")
        step1 = build_ok and wood_after == wood_before - 30 and towers_after == towers_before + 1

        # ---- 2. 暂停按钮 ( CycleBar 总线修复验证) ----
        cd1 = await page.text_content(".countdown")
        await page.click(".clock-btn")  # 暂停
        await page.wait_for_timeout(1800)
        cd2 = await page.text_content(".countdown")
        paused_label = await page.evaluate(
            "() => document.querySelector('.clock-btn')?.textContent"
        )
        await page.click(".clock-btn")  # 继续
        await page.wait_for_timeout(1200)
        cd3 = await page.text_content(".countdown")
        print("\n=== 2. 暂停/继续 (按钮->总线->scheduler) ===")
        print(f"  暂停前 {cd1} -> 暂停中 {cd2} (应相等) -> 继续后 {cd3} (应变化)")
        print(f"  按钮态: {paused_label} (暂停中应为 ▶)")
        step2 = cd1 == cd2 and cd1 != cd3 and paused_label == "▶"

        # ---- 3. fps 采样 (3s, SwiftShader 软渲染参考值) ----
        fps = await page.evaluate(
            """async () => {
               let frames = 0;
               const t0 = performance.now();
               await new Promise(res => {
                 const tick = () => { frames++; performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : res(); };
                 requestAnimationFrame(tick);
               });
               return frames / ((performance.now() - t0) / 1000);
             }"""
        )
        print(f"\n=== 3. fps (软渲染参考) ===\n  {fps:.1f} fps")

        print(f"\n=== PageError ({len(errors)}) ===")
        for e in errors[:5]:
            print("  " + e[:200])

        await page.screenshot(path="/workspace/misthold/docs/smoke-interact.png")
        print("截图: docs/smoke-interact.png")

        ok = step1 and step2 and len(errors) == 0
        print(f"\n=== 交互验证结论: {'PASS' if ok else 'FAIL'} (step1={step1} step2={step2}) ===")
        await browser.close()
        return 0 if ok else 1


sys.exit(asyncio.run(main()))
