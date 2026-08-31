#!/usr/bin/env node
/* MMM-EarthquakeMonitorJP — Notification mode verification
 *
 * Runs the REAL module file in a tiny headless DOM + MagicMirror shim and
 * asserts the notification lifecycle:
 *   - nothing rendered while idle
 *   - appears + blinks on a live event
 *   - stale events are suppressed
 *   - auto-expires after notificationDuration
 *   - list mode still behaves as before
 *
 * No browser or MagicMirror install required.
 *
 * Usage: node preview/verify.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

// ─── Assertions ────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log("  \x1b[32m✓\x1b[0m " + label);
  } else {
    failed++;
    console.log("  \x1b[31m✗\x1b[0m " + label + (detail ? "  → " + detail : ""));
  }
}

function section(title) {
  console.log("\n\x1b[1m" + title + "\x1b[0m");
}

// ─── Minimal DOM ───────────────────────────────────────────────────
// A stand-in document.body so overlay mount/unmount can be observed
let bodyEl = null;

function createElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    _classes: new Set(),
    textContent: "",
    innerHTML: "",

    get className() {
      return Array.from(this._classes).join(" ");
    },
    set className(v) {
      this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    },

    classList: {
      add(...names) { names.forEach((n) => n && el._classes.add(n)); },
      remove(...names) { names.forEach((n) => el._classes.delete(n)); },
      contains(n) { return el._classes.has(n); },
    },

    id: "",

    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },

    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },

    // Depth-first search used by the assertions below
    find(predicate) {
      for (const c of this.children) {
        if (predicate(c)) return c;
        const nested = c.find ? c.find(predicate) : null;
        if (nested) return nested;
      }
      return null;
    },

    findAll(predicate, acc = []) {
      for (const c of this.children) {
        if (predicate(c)) acc.push(c);
        if (c.findAll) c.findAll(predicate, acc);
      }
      return acc;
    },

    // Flatten all text for content assertions.
    // Includes innerHTML (tags stripped) because the module sets some
    // headers via innerHTML rather than textContent.
    get text() {
      let t = this.textContent || "";
      if (this.innerHTML) t += " " + String(this.innerHTML).replace(/<[^>]*>/g, " ");
      this.children.forEach((c) => { t += " " + (c.text || ""); });
      return t.replace(/\s+/g, " ").trim();
    },
  };
  return el;
}

// ─── Load the real module under a MagicMirror shim ─────────────────
function loadModule() {
  const src = fs.readFileSync(
    path.join(ROOT, "MMM-EarthquakeMonitorJP.js"),
    "utf8"
  );

  let registered = null;
  const quiet = () => {};

  bodyEl = createElement("body");

  const documentShim = {
    createElement,
    body: bodyEl,
    getElementById(id) {
      const hit = bodyEl.find((c) => c.id === id);
      return hit || null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const sandbox = {
    document: documentShim,
    window: {},
    Module: { register: (name, def) => { registered = def; } },
    Log: { info: quiet, log: quiet, warn: quiet, error: quiet, debug: quiet },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "MMM-EarthquakeMonitorJP.js" });

  if (!registered) throw new Error("Module.register was never called");
  return registered;
}

const definition = loadModule();

// ─── Instantiate ───────────────────────────────────────────────────
function instantiate(userConfig) {
  const inst = Object.create(definition);
  inst.config = Object.assign({}, definition.defaults, userConfig);
  inst.hidden = false;
  inst.lockStrings = [];
  inst.updateDomCalls = 0;

  inst.updateDom = function () { this.updateDomCalls++; };
  inst.sendSocketNotification = function () {};
  inst.show = function (speed, opts) {
    const lock = opts && opts.lockString;
    if (lock) {
      const i = this.lockStrings.indexOf(lock);
      if (i >= 0) this.lockStrings.splice(i, 1);
    }
    if (this.lockStrings.length === 0) this.hidden = false;
  };
  inst.hide = function (speed, opts) {
    const lock = opts && opts.lockString;
    if (lock && this.lockStrings.indexOf(lock) < 0) this.lockStrings.push(lock);
    this.hidden = true;
  };

  inst.start();
  return inst;
}

// ─── Fixture builders ──────────────────────────────────────────────
/**
 * The P2P Quake API always reports JST wall-clock time, and the module
 * parses it as JST. Fixtures must therefore emit JST regardless of the
 * host timezone (CI runs in UTC), otherwise events look hours stale.
 */
function p2pTime(date) {
  const p = (n) => String(n).padStart(2, "0");
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return (
    jst.getUTCFullYear() + "/" + p(jst.getUTCMonth() + 1) + "/" + p(jst.getUTCDate()) +
    " " + p(jst.getUTCHours()) + ":" + p(jst.getUTCMinutes()) + ":" + p(jst.getUTCSeconds())
  );
}

let fixtureSeq = 0;
function quakeEvent({ scale = 30, place = "宮古島近海", magnitude = 4.0, depth = 50, ageSec = 0 } = {}) {
  const t = new Date(Date.now() - ageSec * 1000);
  return {
    code: 551,
    id: "fixture-q-" + (++fixtureSeq),
    time: p2pTime(t),
    earthquake: {
      time: p2pTime(t),
      maxScale: scale,
      domesticTsunami: "None",
      hypocenter: { name: place, magnitude, depth },
    },
    points: [],
  };
}

function eewEvent({ place = "宗谷地方北部", cancelled = false } = {}) {
  const t = new Date();
  return {
    code: 556,
    id: "fixture-e-" + (++fixtureSeq),
    time: p2pTime(t),
    cancelled,
    issue: { eventId: "ev-" + fixtureSeq, serial: "1", time: p2pTime(t) },
    earthquake: { hypocenter: { name: place, magnitude: 5.5, depth: 10 } },
    areas: [{ pref: "北海道", name: "上川地方北部", scaleFrom: 45, scaleTo: 50 }],
  };
}

function tsunamiEvent({ grade = "Watch", cancelled = false } = {}) {
  const t = new Date();
  return {
    code: 552,
    id: "fixture-t-" + (++fixtureSeq),
    time: p2pTime(t),
    cancelled,
    areas: cancelled ? [] : [
      { grade, name: "青森県太平洋沿岸", immediate: false,
        maxHeight: { description: "１ｍ", value: 1 } },
    ],
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════
(async function run() {
  console.log("\x1b[1m\x1b[36mMMM-EarthquakeMonitorJP — notification mode verification\x1b[0m");

  // ─────────────────────────────────────────────────────────────────
  section("1. Idle state (notification mode, no events)");
  {
    const m = instantiate({ displayMode: "notification" });
    const dom = m.getDom();

    check("displayMode is detected as notification", m._isNotificationMode());
    check("wrapper carries eq-notify-empty", dom.classList.contains("eq-notify-empty"));
    check("nothing is rendered", dom.children.length === 0,
      "children=" + dom.children.length);
    check("no expiry ticker running", !m._notifTimer);

    // Connection status must not produce a placeholder
    m.socketNotificationReceived("CONNECTION_STATUS", { status: "connected" });
    const dom2 = m.getDom();
    check("still empty after CONNECTION_STATUS", dom2.children.length === 0);
    check("module hidden via lockString", m.hidden === true,
      "hidden=" + m.hidden);
    check("lockString registered", m.lockStrings.includes("eqNotify"));

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("2. Startup backlog is ignored (notifyOnInitialLoad: false)");
  {
    const m = instantiate({ displayMode: "notification" });
    m.socketNotificationReceived("INITIAL_DATA", [
      quakeEvent({ ageSec: 0 }),
      quakeEvent({ ageSec: 60 }),
      quakeEvent({ ageSec: 120 }),
    ]);

    check("no notifications created from backlog", m.notifications.length === 0,
      "got " + m.notifications.length);
    check("module stays hidden", m.hidden === true);
    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("3. Live earthquake creates a blinking notification");
  {
    const m = instantiate({ displayMode: "notification", notificationDuration: 300 });
    m.socketNotificationReceived("QUAKE_DATA",
      quakeEvent({ scale: 40, place: "茨城県沖", magnitude: 5.1, depth: 40 }));

    check("one notification queued", m.notifications.length === 1,
      "got " + m.notifications.length);
    check("module becomes visible", m.hidden === false);
    check("lockString released", m.lockStrings.length === 0);
    check("expiry ticker started", !!m._notifTimer);

    const n = m.notifications[0];
    check("title contains intensity", n.title.includes("震度4"), n.title);
    check("title contains place", n.title.includes("茨城県沖"), n.title);
    check("detail contains magnitude", n.detail.includes("M5.1"), n.detail);
    check("detail contains depth", n.detail.includes("40km"), n.detail);

    const lifetime = (n.expiresAt - n.createdAt) / 1000;
    check("lifetime is 300s (5 min)", Math.abs(lifetime - 300) < 2,
      lifetime + "s");

    const dom = m.getDom();
    check("wrapper is not marked empty", !dom.classList.contains("eq-notify-empty"));
    check("one notification element rendered", dom.children.length === 1);

    const item = dom.children[0];
    check("has eq-notify class", item.classList.contains("eq-notify"));
    check("blink class applied", item.classList.contains("eq-notify-blink"));
    check("severity class applied", item.classList.contains("eq-notify-sev-1"));

    const badge = dom.find((c) => c.classList.contains("eq-notify-badge"));
    check("intensity badge rendered", !!badge && badge.textContent === "4",
      badge ? badge.textContent : "missing");
    check("badge colorized by scale", !!badge && badge.classList.contains("eq-scale-40"));

    const bar = dom.find((c) => c.classList.contains("eq-notify-countdown-bar"));
    check("countdown bar rendered", !!bar);
    check("countdown starts near 100%", !!bar && parseFloat(bar.style.width) > 98,
      bar ? bar.style.width : "missing");

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("4. Stale events are suppressed (notificationFreshness)");
  {
    const m = instantiate({
      displayMode: "notification",
      notificationFreshness: 600, // 10 min
    });

    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ ageSec: 30 * 60 }));
    check("30-min-old quake produces no notification", m.notifications.length === 0,
      "got " + m.notifications.length);
    check("module remains hidden", m.hidden === true);

    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ ageSec: 60 }));
    check("1-min-old quake DOES notify", m.notifications.length === 1,
      "got " + m.notifications.length);

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("5. notificationMinScale filter");
  {
    const m = instantiate({
      displayMode: "notification",
      notificationMinScale: 40, // 震度4以上
    });

    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 20 }));
    check("震度2 filtered out", m.notifications.length === 0);

    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 50 }));
    check("震度5強 passes filter", m.notifications.length === 1);

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("6. EEW and tsunami notifications");
  {
    const m = instantiate({ displayMode: "notification", notificationMaxItems: 3 });

    m.socketNotificationReceived("EEW_DATA", eewEvent());
    const eew = m.notifications.find((n) => n.type === "eew");
    check("EEW notification created", !!eew);
    check("EEW has highest severity (3)", eew && eew.severity === 3,
      eew ? String(eew.severity) : "missing");
    check("EEW title mentions 緊急地震速報", eew && eew.title.includes("緊急地震速報"),
      eew ? eew.title : "");
    check("EEW detail lists warning areas", eew && eew.detail.includes("上川地方北部"),
      eew ? eew.detail : "");

    m.socketNotificationReceived("TSUNAMI_DATA", tsunamiEvent({ grade: "MajorWarning" }));
    const tsu = m.notifications.find((n) => n.type === "tsunami");
    check("tsunami notification created", !!tsu);
    check("大津波警報 title", tsu && tsu.title === "大津波警報", tsu ? tsu.title : "");
    check("tsunami severity 3", tsu && tsu.severity === 3);

    // Severity ordering: EEW/tsunami above a plain quake
    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 20 }));
    check("highest severity sorted first", m.notifications[0].severity === 3,
      "first severity=" + m.notifications[0].severity);

    const dom = m.getDom();
    check("renders 3 notifications (maxItems=3)", dom.children.length === 3,
      "got " + dom.children.length);

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("7. notificationMaxItems caps the queue");
  {
    const m = instantiate({ displayMode: "notification", notificationMaxItems: 1 });
    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ place: "A", scale: 20 }));
    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ place: "B", scale: 20 }));
    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ place: "C", scale: 20 }));

    check("only 1 notification kept", m.notifications.length === 1,
      "got " + m.notifications.length);
    check("newest wins", m.notifications[0].title.includes("C"),
      m.notifications[0].title);

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("8. Same event updating does not duplicate");
  {
    const m = instantiate({ displayMode: "notification", notificationMaxItems: 3 });
    const ev = quakeEvent({ scale: 30 });

    m.socketNotificationReceived("QUAKE_DATA", ev);
    // JMA re-issues the same quake with a refined intensity
    const revised = JSON.parse(JSON.stringify(ev));
    revised.earthquake.maxScale = 40;
    m.socketNotificationReceived("QUAKE_DATA", revised);

    check("still a single notification", m.notifications.length === 1,
      "got " + m.notifications.length);
    check("shows the revised intensity", m.notifications[0].title.includes("震度4"),
      m.notifications[0].title);

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("9. Auto-expiry — notification disappears completely");
  {
    // 3s lifetime, 1s blink so the whole lifecycle is observable quickly
    const m = instantiate({
      displayMode: "notification",
      notificationDuration: 3,
      notificationBlinkDuration: 1,
    });

    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 30 }));
    check("notification present at t=0", m.notifications.length === 1);
    check("blinking at t=0", m.getDom().children[0].classList.contains("eq-notify-blink"));
    check("visible at t=0", m.hidden === false);

    await sleep(1600);
    check("still present at t≈1.6s", m.notifications.length === 1,
      "got " + m.notifications.length);
    check("blink stopped after blinkDuration",
      !m.getDom().children[0].classList.contains("eq-notify-blink"));

    const bar = m.getDom().find((c) => c.classList.contains("eq-notify-countdown-bar"));
    const pct = bar ? parseFloat(bar.style.width) : -1;
    check("countdown bar decreased", pct > 20 && pct < 70, pct + "%");

    await sleep(1900);
    check("expired at t≈3.5s", m.notifications.length === 0,
      "got " + m.notifications.length);
    check("module hidden again", m.hidden === true);
    check("lockString re-applied", m.lockStrings.includes("eqNotify"));
    check("ticker stopped (no leak)", !m._notifTimer);

    const dom = m.getDom();
    check("renders nothing after expiry", dom.children.length === 0);
    check("wrapper marked empty", dom.classList.contains("eq-notify-empty"));
  }

  // ─────────────────────────────────────────────────────────────────
  section("10. List mode is unchanged (regression guard)");
  {
    const m = instantiate({ displayMode: "list" });
    check("not notification mode", !m._isNotificationMode());

    m.socketNotificationReceived("INITIAL_DATA", [
      quakeEvent({ scale: 30, place: "宮古島近海" }),
      quakeEvent({ scale: 20, place: "千葉県北西部" }),
    ]);

    check("quakes stored in list mode", m.quakes.length === 2,
      "got " + m.quakes.length);
    check("no notifications used", m.notifications.length === 0);

    const dom = m.getDom();
    check("renders quake rows", dom.children.length === 2,
      "got " + dom.children.length);
    check("shows hypocenter name", dom.text.includes("宮古島近海"));

    m.socketNotificationReceived("EEW_DATA", eewEvent());
    check("EEW stored in list mode", m.eewAlerts.length === 1);
    check("EEW rendered in list mode", m.getDom().text.includes("緊急地震速報"));
  }

  // ─────────────────────────────────────────────────────────────────
  section("10b. Quake severity tiers drive the styling");
  {
    const m = instantiate({ displayMode: "notification", notificationMaxItems: 1 });
    const sevFor = (scale) => {
      m.notifications = [];
      m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale }));
      return m.notifications.length ? m.notifications[0].severity : null;
    };

    check("震度3 → severity 1 (info)", sevFor(30) === 1, "got " + sevFor(30));
    check("震度4 → severity 1 (info)", sevFor(40) === 1, "got " + sevFor(40));
    check("震度5弱 → severity 2 (caution)", sevFor(45) === 2, "got " + sevFor(45));
    check("震度5強 → severity 2 (caution)", sevFor(50) === 2, "got " + sevFor(50));
    check("震度6弱 → severity 3 (warning)", sevFor(55) === 3, "got " + sevFor(55));
    check("震度7 → severity 3 (warning)", sevFor(70) === 3, "got " + sevFor(70));

    m._stopNotificationTicker();
  }

  // ─────────────────────────────────────────────────────────────────
  section("11. Fullscreen alert — thresholds");
  {
    const overlay = () => bodyEl.find((c) => c.id === "eq-fullscreen-overlay");

    // Disabled by default
    const off = instantiate({ displayMode: "notification" });
    off.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 70 }));
    check("no overlay when fullscreenAlert is false", !overlay());
    check("fullscreenAlert defaults to false", off.config.fullscreenAlert === false);
    off._clearAllForTest();

    // Below threshold (震度4 < 震度5弱)
    const m = instantiate({
      displayMode: "notification",
      fullscreenAlert: true,
      fullscreenMinScale: 45,
      fullscreenDuration: 30,
    });

    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 40 }));
    check("震度4 does NOT trigger fullscreen (below minScale)", !overlay());
    check("but a normal notification is still queued", m.notifications.length === 1);

    // At/above threshold
    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 50, place: "石川県能登地方" }));
    const ov = overlay();
    check("震度5強 DOES trigger fullscreen", !!ov);
    check("overlay marked as fullscreen", !!ov && ov.classList.contains("eq-fullscreen"));
    check("dim background applied", !!ov && ov.classList.contains("eq-fullscreen-dim"));
    check("blink applied", !!ov && ov.classList.contains("eq-fullscreen-blink"));
    check("overlay shows place", !!ov && ov.text.includes("石川県能登地方"), ov ? ov.text.slice(0, 60) : "");
    check("overlay shows 最大震度 label", !!ov && ov.text.includes("最大震度"));
    check("overlay shows a call to action",
      !!ov && ov.text.includes("身の安全を確保") , ov ? ov.text.slice(-60) : "");
    check("module tracks the active overlay", !!m.fullscreenAlert);

    m._clearAllForTest();
    check("clear removes the overlay", !overlay());
    check("fullscreenAlert state reset", m.fullscreenAlert === null);
  }

  // ─────────────────────────────────────────────────────────────────
  section("12. Fullscreen alert — EEW / tsunami / auto-dismiss");
  {
    const overlay = () => bodyEl.find((c) => c.id === "eq-fullscreen-overlay");

    const m = instantiate({
      displayMode: "notification",
      fullscreenAlert: true,
      fullscreenMinScale: 45,
      fullscreenDuration: 2, // short so expiry is observable
    });

    // EEW always escalates regardless of intensity
    m.socketNotificationReceived("EEW_DATA", eewEvent());
    let ov = overlay();
    check("EEW triggers fullscreen", !!ov);
    check("EEW overlay is severity 3", !!ov && ov.classList.contains("eq-fullscreen-sev-3"));
    check("EEW action text", !!ov && ov.text.includes("強い揺れに備えて"));

    // EEW cancellation must NOT go fullscreen
    m._dismissFullscreenAlert();
    m.socketNotificationReceived("EEW_DATA", eewEvent({ cancelled: true }));
    check("EEW cancellation does not go fullscreen", !overlay());

    // 大津波警報 escalates; 注意報 does not (severity 2 < 3)
    m.socketNotificationReceived("TSUNAMI_DATA", tsunamiEvent({ grade: "MajorWarning" }));
    ov = overlay();
    check("大津波警報 triggers fullscreen", !!ov);
    check("tsunami evacuation message", !!ov && ov.text.includes("高台へ避難"));

    m._dismissFullscreenAlert();
    m.socketNotificationReceived("TSUNAMI_DATA", tsunamiEvent({ grade: "Watch" }));
    check("津波注意報 does NOT go fullscreen", !overlay());

    // Auto-dismiss after fullscreenDuration
    m._dismissFullscreenAlert();
    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 60 }));
    check("震度6強 overlay shown", !!overlay());
    await sleep(2400);
    check("overlay auto-dismissed after fullscreenDuration", !overlay());
    check("state cleared after auto-dismiss", m.fullscreenAlert === null);

    m._clearAllForTest();
  }

  // ─────────────────────────────────────────────────────────────────
  section("13. Fullscreen works in list mode too");
  {
    const overlay = () => bodyEl.find((c) => c.id === "eq-fullscreen-overlay");

    const m = instantiate({
      displayMode: "list",
      fullscreenAlert: true,
      fullscreenMinScale: 45,
      fullscreenDuration: 30,
    });

    m.socketNotificationReceived("QUAKE_DATA", quakeEvent({ scale: 70, place: "宮城県沖" }));
    check("overlay shown in list mode", !!overlay());
    check("list still populated", m.quakes.length === 1);
    check("no notifications created in list mode", m.notifications.length === 0);

    m._dismissFullscreenAlert();
    m.socketNotificationReceived("EEW_DATA", eewEvent());
    check("EEW overlay shown in list mode", !!overlay());
    check("EEW also stored for the list", m.eewAlerts.length === 1);

    m._clearAllForTest();
  }

  // ─────────────────────────────────────────────────────────────────
  section("14. Fullscreen de-duplication and suspend cleanup");
  {
    const overlay = () => bodyEl.find((c) => c.id === "eq-fullscreen-overlay");
    const overlayCount = () =>
      bodyEl.findAll((c) => c.id === "eq-fullscreen-overlay").length;

    const m = instantiate({
      displayMode: "notification",
      fullscreenAlert: true,
      fullscreenMinScale: 45,
      fullscreenDuration: 30,
    });

    const ev = quakeEvent({ scale: 60 });
    m.socketNotificationReceived("QUAKE_DATA", ev);
    m.socketNotificationReceived("QUAKE_DATA", ev); // same event again
    check("same event does not stack overlays", overlayCount() === 1,
      "count=" + overlayCount());

    // suspend() must tear the overlay down
    m.suspend();
    check("suspend() removes the overlay", !overlay());
    check("suspend() stops the ticker", !m._notifTimer);

    m._clearAllForTest();
  }

  // ─────────────────────────────────────────────────────────────────
  section("15. Test mode — scenarios, payloads and the notification bus");
  {
    const m = instantiate({
      displayMode: "notification",
      testMode: true,
      testHotkeys: false,
      fullscreenAlert: true,
      fullscreenMinScale: 45,
      fullscreenDuration: 30,
    });

    const names = Object.keys(m.testScenarios);
    check("scenario catalogue is non-empty", names.length >= 10,
      names.length + " scenarios");
    check("every scenario has key + label + code",
      names.every((n) => {
        const s = m.testScenarios[n];
        return s.key && s.label && s.code;
      }));
    check("hotkeys are unique",
      new Set(names.map((n) => m.testScenarios[n].key)).size === names.length);

    // Every scenario must build a valid, dispatchable payload
    const bad = names.filter((n) => {
      const p = m.buildTestPayload(n);
      return !p || [551, 552, 556].indexOf(p.code) < 0 || !p.id || !p._isTest;
    });
    check("all scenarios build valid payloads", bad.length === 0,
      bad.join(", "));

    check("unknown scenario returns null", m.buildTestPayload("nope") === null);
    check("runTestScenario rejects unknown names", m.runTestScenario("nope") === false);

    // Synthetic quakes must be fresh enough to notify
    m._clearAllForTest();
    check("runTestScenario('quake4') succeeds", m.runTestScenario("quake4") === true);
    check("test scenario produced a notification", m.notifications.length === 1,
      "got " + m.notifications.length);
    check("notification flagged as test data", m.notifications[0].isTest === true);

    // Fullscreen from a test scenario carries the TEST DATA marker
    m._clearAllForTest();
    m.runTestScenario("quake7");
    const ov = bodyEl.find((c) => c.id === "eq-fullscreen-overlay");
    check("severe test scenario goes fullscreen", !!ov);
    check("overlay carries the TEST DATA marker",
      !!ov && ov.text.includes("TEST DATA"), ov ? "no marker" : "no overlay");

    // Stale scenario is still correctly suppressed
    m._clearAllForTest();
    m.runTestScenario("quakeStale");
    check("stale test scenario is suppressed", m.notifications.length === 0);

    // MagicMirror notification bus
    m._clearAllForTest();
    m.notificationReceived("EARTHQUAKE_TEST", "quake4");
    check("EARTHQUAKE_TEST triggers a scenario", m.notifications.length === 1,
      "got " + m.notifications.length);

    m.notificationReceived("EARTHQUAKE_TEST_CLEAR");
    check("EARTHQUAKE_TEST_CLEAR resets state", m.notifications.length === 0);

    m.runTestScenario("quake7");
    check("overlay present before dismiss",
      !!bodyEl.find((c) => c.id === "eq-fullscreen-overlay"));
    m.notificationReceived("EARTHQUAKE_DISMISS_FULLSCREEN");
    check("EARTHQUAKE_DISMISS_FULLSCREEN closes the overlay",
      !bodyEl.find((c) => c.id === "eq-fullscreen-overlay"));

    m._clearAllForTest();
  }

  // ─────────────────────────────────────────────────────────────────
  section("16. Test mode is opt-in and safe by default");
  {
    const prod = instantiate({ displayMode: "notification" });
    check("testMode defaults to false", prod.config.testMode === false);
    check("fullscreenAlert defaults to false", prod.config.fullscreenAlert === false);

    // The bus must be inert unless testMode is on
    prod.notificationReceived("EARTHQUAKE_TEST", "quake7");
    check("EARTHQUAKE_TEST ignored without testMode",
      prod.notifications.length === 0, "got " + prod.notifications.length);
    check("no overlay created without testMode",
      !bodyEl.find((c) => c.id === "eq-fullscreen-overlay"));

    // Test badge only renders when explicitly enabled
    const noBadge = prod.getDom();
    check("no TEST badge in production config",
      !noBadge.find((c) => c.classList.contains("eq-test-badge")));

    const testing = instantiate({
      displayMode: "notification", testMode: true, testShowBadge: true,
    });
    const badgeDom = testing.getDom();
    check("TEST badge rendered when enabled",
      !!badgeDom.find((c) => c.classList.contains("eq-test-badge")));

    // List mode must still collapse when there is nothing to show
    const listProd = instantiate({ displayMode: "list" });
    listProd.loaded = true;
    listProd.connectionStatus = "connected";
    check("empty list mode stays hidden",
      listProd.getDom().style.display === "none",
      "display=" + listProd.getDom().style.display);

    prod._clearAllForTest();
    testing._clearAllForTest();
  }

  // ─────────────────────────────────────────────────────────────────
  console.log(
    "\n\x1b[1m" + "─".repeat(56) + "\x1b[0m\n" +
    "\x1b[1mResult:\x1b[0m \x1b[32m" + passed + " passed\x1b[0m" +
    (failed > 0 ? ", \x1b[31m" + failed + " failed\x1b[0m" : "") + "\n"
  );

  process.exit(failed > 0 ? 1 : 0);
})();
