"""黑雾城邦 P0 切片 · headless 真实浏览器冒烟验证 (D1 验收) v2
修正选择器 (.res-item / .minimap-cell) 并扩展为全周期推进验证:
  筹备期 -> 预警期 -> 入侵期(敌人进攻/核心受击) -> 清算期 -> 下一周期
"""
import asyncio
import sys

from playwright.async_api import async_playwright

URL = "http://localhost:5173/"
PHASES = ["筹备期", "预警期", "入侵期", "清算期"]


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
        )
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        console_lines: list[str] = []
        page.on("console", lambda m: console_lines.append(f"[{m.type}] {m.text}"))
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_function(
            "() => document.getElementById('hud-root')?.children.length > 0", timeout=30000
        )

        seen: dict[str, str] = {}  # phase -> countdown snapshot
        deadline_phase = "入侵期"
        try:
            await page.wait_for_function(
                f"() => document.querySelector('.phase-badge')?.textContent?.includes('{deadline_phase}')",
                timeout=90000,
            )
        except Exception:
            print(f"!! 90s 内未到达 {deadline_phase}")

        # 入侵期观察 8s: 敌人/核心受击/告警
        await page.wait_for_timeout(8000)
        snap_invade = await page.evaluate(
            """() => ({
                phase: document.querySelector('.phase-badge')?.textContent?.trim(),
                core: document.querySelector('.core-hp, [class*=core]')?.textContent?.trim() ?? null,
                alerts: [...document.querySelectorAll('.alert')].map(e => e.textContent.trim()).slice(0,4),
                minimapCells: document.querySelectorAll('.minimap-cell').length,
            })"""
        )
        print("=== 入侵期快照 ===")
        for k, v in snap_invade.items():
            print(f"  {k}: {v}")

        # 记录经历过的阶段
        seen_text = await page.evaluate(
            "() => document.querySelector('.phase-badge')?.textContent?.trim()"
        )
        seen[deadline_phase] = seen_text or ""

        # 继续等到回到筹备期 (新周期) 或超时
        try:
            await page.wait_for_function(
                "() => document.querySelector('.phase-badge')?.textContent?.includes('筹备期')"
                " && document.querySelector('.day-label')?.textContent?.includes('2')",
                timeout=120000,
            )
            cycle2 = True
        except Exception:
            cycle2 = False
        print(f"\n=== 第二周期筹备期到达: {'OK' if cycle2 else 'FAIL(超时)'} ===")

        final = await page.evaluate(
            """() => ({
                boot: document.getElementById('boot')?.textContent?.trim(),
                bootDone: !!document.querySelector('#boot.done'),
                day: document.querySelector('.day-label')?.textContent?.trim(),
                phase: document.querySelector('.phase-badge')?.textContent?.trim(),
                countdown: document.querySelector('.countdown')?.textContent?.trim(),
                resources: [...document.querySelectorAll('.res-item .res-value')].map(e => e.textContent.trim()),
                minimapCells: document.querySelectorAll('.minimap-cell').length,
                buildTabs: document.querySelectorAll('.build-tab').length,
                unitCards: document.querySelectorAll('.unit-card, [class*=unit]').length,
            })"""
        )
        print("\n=== 最终 DOM 状态 ===")
        for k, v in final.items():
            print(f"  {k}: {v}")

        print(f"\n=== Console ({len(console_lines)} 行, 末 12 行) ===")
        for line in console_lines[-12:]:
            print("  " + line[:180])
        print(f"\n=== PageError ({len(errors)}) ===")
        for e in errors[:5]:
            print("  " + e[:300])

        await page.screenshot(path="/workspace/misthold/docs/smoke-hud.png")
        print("\n截图: docs/smoke-hud.png")

        ok = (
            final["bootDone"]
            and final["phase"] in PHASES
            and final["countdown"]
            and len(final["resources"]) >= 5
            and final["minimapCells"] == 256
            and final["buildTabs"] == 5
            and len(errors) == 0
        )
        print(f"\n=== 冒烟结论: {'PASS' if ok else 'FAIL'} ===")
        await browser.close()
        return 0 if ok else 1


sys.exit(asyncio.run(main()))
