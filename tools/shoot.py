"""Take the entry's screenshots from the real game in a real browser.

Serves nothing itself: it expects `node serve.ts --port 8099` to be running. For each scene in
shots.json it opens the game at that query, waits for window.__shotReady, and writes a JPEG at
1280x720 (the arena's own logical size, so the long side is 1280 and the short side 720).
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = json.loads((ROOT / "shots.json").read_text())
OUT = ROOT / "screenshots"
BASE = "http://localhost:8099/"


def main() -> int:
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-device-scale-factor=1"])
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

        for shot in SHOTS:
            url = BASE + shot["query"]
            page.goto(url, wait_until="load")
            try:
                page.wait_for_function("window.__shotReady === true", timeout=30000)
            except Exception as exc:  # noqa: BLE001
                print(f"FAIL {shot['name']}: __shotReady never set ({exc})")
                for line in errors:
                    print("  ", line)
                browser.close()
                return 1
            target = OUT / shot["name"]
            page.screenshot(path=str(target), type="jpeg", quality=88)
            size = target.stat().st_size
            print(f"{shot['name']}: {size} bytes")
            if size > 262144:
                print(f"FAIL {shot['name']}: over 256 KiB")
                browser.close()
                return 1

        if errors:
            print("page errors:")
            for line in errors:
                print("  ", line)
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
