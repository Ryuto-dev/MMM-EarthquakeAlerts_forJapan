#!/usr/bin/env python3
"""MMM-EarthquakeMonitorJP — visual design capture.

Renders the module in a headless browser on a MagicMirror-like dark screen
and writes PNGs so the notification and fullscreen designs can be reviewed.

Usage: python3 preview/screenshot.py [--url http://localhost:8080] [--out /tmp/shots]
"""

import argparse
import os
import sys

from playwright.sync_api import sync_playwright

# (filename, config overrides, scenario to fire, wait ms, description)
SHOTS = [
    (
        "01-idle.png",
        {"displayMode": "notification", "testMode": False},
        None, 400,
        "Idle: topbar must show nothing at all",
    ),
    (
        "02-notify-scale3.png",
        {"displayMode": "notification", "notificationCompact": True},
        "quake3", 700,
        "震度3 compact notification in the topbar",
    ),
    (
        "03-notify-scale5.png",
        {"displayMode": "notification", "notificationCompact": True},
        "quake5", 700,
        "震度5強 caution-level notification",
    ),
    (
        "04-notify-eew.png",
        {"displayMode": "notification", "notificationCompact": True},
        "eew", 700,
        "EEW warning notification (severity 3)",
    ),
    (
        "05-notify-expanded.png",
        {"displayMode": "notification", "notificationCompact": False},
        "quake4", 700,
        "Non-compact (two-line) notification layout",
    ),
    (
        "06-notify-multi.png",
        {"displayMode": "notification", "notificationMaxItems": 3,
         "notificationCompact": True},
        ["quake3", "tsunamiWatch", "eew"], 900,
        "Three stacked notifications, sorted by severity",
    ),
    (
        "07-fullscreen-scale7.png",
        {"displayMode": "notification", "fullscreenAlert": True,
         "fullscreenMinScale": 45, "fullscreenDuration": 60},
        "quake7", 900,
        "震度7 fullscreen alert (severity 3)",
    ),
    (
        "08-fullscreen-eew.png",
        {"displayMode": "notification", "fullscreenAlert": True,
         "fullscreenDuration": 60},
        "eew", 900,
        "EEW fullscreen alert",
    ),
    (
        "09-fullscreen-tsunami.png",
        {"displayMode": "notification", "fullscreenAlert": True,
         "fullscreenDuration": 60},
        "tsunamiMajor", 900,
        "大津波警報 fullscreen alert",
    ),
    (
        "10-fullscreen-test-badge.png",
        {"displayMode": "notification", "fullscreenAlert": True,
         "fullscreenDuration": 60, "testMode": True, "testShowBadge": True},
        "quake6", 900,
        "Fullscreen alert with the TEST DATA marker",
    ),
    (
        "11-list-mode.png",
        {"displayMode": "list"},
        ["quake3", "quake4", "quake5"], 900,
        "Legacy list mode still renders the full information",
    ),
]

# A MagicMirror-like page: black background, module mounted top-left.
PAGE = """
<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="{base}/MMM-EarthquakeMonitorJP.css">
<style>
  html,body{{margin:0;padding:0;background:#000;height:100%;
    font-family:"Roboto Condensed","Noto Sans JP",sans-serif;color:#fff;}}
  .mm{{position:relative;height:100vh;padding:16px 20px;box-sizing:border-box;}}
  .mm-top{{min-height:46px;}}
  .mm-clock{{text-align:center;margin-top:40px;}}
  .mm-clock .t{{font-size:60px;font-weight:300;line-height:1;}}
  .mm-clock .d{{color:#999;font-size:16px;}}
  .label{{position:fixed;bottom:6px;right:10px;color:#333;font-size:11px;}}
</style></head><body>
<div class="mm">
  <div class="mm-top"><div id="mount"></div></div>
  <div class="mm-clock"><div class="t">21:45</div><div class="d">8月29日 土曜日</div></div>
</div>
<div class="label" id="label"></div>
<script src="{base}/preview/harness-shim-only.js"></script>
<script src="{base}/MMM-EarthquakeMonitorJP.js"></script>
</body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--out", default="/tmp/eq-shots")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1000, "height": 620})

        for name, config, scenario, wait, desc in SHOTS:
            page.set_content(PAGE.format(base=args.url))
            # Wait for the module file to register against the shim
            page.wait_for_function(
                "() => window.__shim && "
                "window.__shim.registry['MMM-EarthquakeMonitorJP']",
                timeout=15000,
            )

            cfg = dict(config)
            cfg.setdefault("testMode", True)
            cfg.setdefault("testHotkeys", False)
            cfg.setdefault("animationSpeed", 0)

            page.evaluate(
                """([cfg, scenario, desc]) => {
                    const inst = window.__shim.instantiate(
                        "MMM-EarthquakeMonitorJP", cfg,
                        document.getElementById("mount"));
                    window.__inst = inst;
                    document.getElementById("label").textContent = desc;
                    const list = Array.isArray(scenario) ? scenario
                        : (scenario ? [scenario] : []);
                    list.forEach((s) => inst.runTestScenario(s));
                }""",
                [cfg, scenario, desc],
            )

            page.wait_for_timeout(wait)
            path = os.path.join(args.out, name)
            page.screenshot(path=path)

            # Report what actually rendered, for a sanity cross-check
            info = page.evaluate(
                """() => {
                    const i = window.__inst;
                    const ov = document.getElementById('eq-fullscreen-overlay');
                    const m = document.getElementById('mount');
                    return {
                        notifs: (i.notifications || []).length,
                        quakes: (i.quakes || []).length,
                        overlay: !!ov,
                        moduleH: Math.round(
                            m.firstElementChild
                              ? m.firstElementChild.getBoundingClientRect().height
                              : 0),
                    };
                }"""
            )
            results.append((name, desc, info))
            print(f"✓ {name:34s} {info}  {desc}")

        browser.close()

    print(f"\n{len(results)} screenshots written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
