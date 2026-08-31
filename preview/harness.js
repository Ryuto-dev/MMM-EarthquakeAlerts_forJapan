/* MMM-EarthquakeMonitorJP — Preview harness
 *
 * Minimal MagicMirror² shim so the unmodified module file can run in a
 * plain browser. Implements just enough of the Module / Log API:
 *   Module.register, defaults merge, start, getDom, updateDom,
 *   show / hide with lockStrings, suspend / resume,
 *   sendSocketNotification → socketNotificationReceived round-trip.
 */

(() => {
  "use strict";

  // ─── Log shim ────────────────────────────────────────────────────
  const logEl = () => document.getElementById("log");

  function appendLog(level, args) {
    const el = logEl();
    if (!el) return;
    const line = document.createElement("div");
    line.className = "log-line log-" + level;
    const ts = new Date().toTimeString().slice(0, 8);
    line.textContent = "[" + ts + "] " + args.map(String).join(" ");
    el.appendChild(line);
    // Keep the log bounded
    while (el.children.length > 300) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  window.Log = {
    info: (...a) => { console.info(...a); appendLog("info", a); },
    log: (...a) => { console.log(...a); appendLog("info", a); },
    warn: (...a) => { console.warn(...a); appendLog("warn", a); },
    error: (...a) => { console.error(...a); appendLog("error", a); },
    debug: (...a) => { console.debug(...a); appendLog("debug", a); },
  };

  // ─── Module shim ─────────────────────────────────────────────────
  const registry = {};

  window.Module = {
    register(name, definition) {
      registry[name] = definition;
      Log.info("[harness] Module registered: " + name);
    },
    definitions: registry,
  };

  /**
   * Instantiate a registered module against a DOM mount point.
   */
  function instantiate(name, userConfig, mountEl) {
    const def = registry[name];
    if (!def) throw new Error("Module not registered: " + name);

    const instance = Object.create(def);

    instance.name = name;
    instance.identifier = "module_preview_" + name;
    instance.config = Object.assign({}, def.defaults, userConfig || {});
    instance.hidden = false;
    instance.lockStrings = [];
    instance._mount = mountEl;

    // ── updateDom ──
    instance.updateDom = function (speed) {
      const dom = this.getDom();
      // Mirror MagicMirror: the module wrapper is replaced wholesale
      this._mount.innerHTML = "";
      this._mount.appendChild(dom);
      this._mount.dataset.speed = String(speed === undefined ? "" : speed);
      renderState();
    };

    // ── show / hide with lockString semantics ──
    instance.show = function (speed, options) {
      const lock = options && options.lockString;
      if (lock) {
        const i = this.lockStrings.indexOf(lock);
        if (i >= 0) this.lockStrings.splice(i, 1);
      }
      if (this.lockStrings.length > 0) return;
      this.hidden = false;
      this._mount.classList.remove("module-hidden");
      renderState();
    };

    instance.hide = function (speed, options) {
      const lock = options && options.lockString;
      if (lock && this.lockStrings.indexOf(lock) < 0) {
        this.lockStrings.push(lock);
      }
      this.hidden = true;
      this._mount.classList.add("module-hidden");
      renderState();
    };

    // ── Socket round-trip: module ⇄ node_helper ──
    instance.sendSocketNotification = function (notification, payload) {
      Log.debug("[harness] → node_helper: " + notification);
      // The preview injects data directly, so CONFIG is just acknowledged.
      if (notification === "CONFIG") {
        setTimeout(() => {
          instance.socketNotificationReceived("CONNECTION_STATUS", {
            status: "connected",
          });
        }, 150);
      }
    };

    // Loop broadcasts straight back so notificationReceived() is testable
    instance.sendNotification = function (notification, payload) {
      Log.debug("[harness] broadcast: " + notification);
      if (typeof instance.notificationReceived === "function") {
        instance.notificationReceived(notification, payload, instance);
      }
    };

    instance.translate = (key) => key;
    instance.file = (f) => f;

    instance.start();
    instance.updateDom(0);

    return instance;
  }

  // ══════════════════════════════════════════════════════════════════
  // Preview application
  // ══════════════════════════════════════════════════════════════════

  const MODULE_NAME = "MMM-EarthquakeMonitorJP";

  let current = null;
  let livePollTimer = null;
  const liveSeenIds = new Set();

  function readConfigFromForm() {
    const num = (id) => Number(document.getElementById(id).value);
    const bool = (id) => document.getElementById(id).checked;

    return {
      displayMode: document.querySelector('input[name="displayMode"]:checked').value,
      notificationDuration: num("notificationDuration"),
      notificationMaxItems: num("notificationMaxItems"),
      notificationMinScale: num("notificationMinScale"),
      notificationBlinkDuration: num("notificationBlinkDuration"),
      notificationFreshness: num("notificationFreshness"),
      notificationBlink: bool("notificationBlink"),
      notificationCompact: bool("notificationCompact"),
      notificationShowCountdown: bool("notificationShowCountdown"),
      notifyOnInitialLoad: bool("notifyOnInitialLoad"),

      // Fullscreen overlay
      fullscreenAlert: bool("fullscreenAlert"),
      fullscreenMinScale: num("fullscreenMinScale"),
      fullscreenDuration: num("fullscreenDuration"),
      fullscreenBlink: bool("fullscreenBlink"),
      fullscreenDimBackground: bool("fullscreenDimBackground"),

      // Test mode
      testMode: bool("testMode"),
      testShowBadge: bool("testShowBadge"),
      // The preview page owns the buttons, so no global hotkeys/auto-run
      testHotkeys: false,
      testAutoRun: false,

      animationSpeed: 400,
      // The harness feeds data manually
      useWebSocket: false,
      useRESTFallback: false,
    };
  }

  function rebuild() {
    const mount = document.getElementById("module-mount");
    if (current) {
      current._stopNotificationTicker && current._stopNotificationTicker();
      current._dismissFullscreenAlert && current._dismissFullscreenAlert();
      if (current._testAutoRunTimer) clearInterval(current._testAutoRunTimer);
    }
    mount.className = "module-mount";
    mount.innerHTML = "";

    const config = readConfigFromForm();
    current = instantiate(MODULE_NAME, config, mount);

    // Keep the fullscreen overlay inside the simulated mirror so the
    // control panel remains usable while it is displayed.
    current._overlayHost = document.getElementById("mirror");

    Log.info(
      "[harness] Module rebuilt (displayMode=" + config.displayMode +
      ", duration=" + config.notificationDuration + "s" +
      ", fullscreen=" + config.fullscreenAlert +
      ", testMode=" + config.testMode + ")"
    );
    renderState();
  }

  // ─── Event injection ─────────────────────────────────────────────
  function dispatchToModule(data) {
    if (!current) return;
    const map = { 551: "QUAKE_DATA", 552: "TSUNAMI_DATA", 556: "EEW_DATA" };
    const notification = map[data.code];
    if (!notification) {
      Log.warn("[harness] Unhandled code: " + data.code);
      return;
    }
    Log.info("[harness] Injecting " + notification + " (code " + data.code + ")");
    current.socketNotificationReceived(notification, data);
  }

  /**
   * Delegate to the module's own scenario runner, so the preview exercises
   * exactly the same code path as testMode inside a real MagicMirror.
   */
  function inject(scenarioName) {
    if (!current) return;
    if (!current.runTestScenario(scenarioName)) {
      Log.error("[harness] Unknown scenario: " + scenarioName);
    }
  }

  /** Exercise the MagicMirror broadcast bus path. */
  function injectViaBus(scenarioName) {
    if (!current) return;
    Log.info("[harness] via notification bus → EARTHQUAKE_TEST / " + scenarioName);
    current.sendNotification("EARTHQUAKE_TEST", scenarioName);
  }

  function clearAll() {
    if (!current) return;
    if (typeof current._clearAllForTest === "function") {
      current._clearAllForTest();
    } else {
      current.notifications = [];
      current.quakes = [];
      current.eewAlerts = [];
      current.tsunamiWarnings = [];
      current.updateDom(0);
    }
    Log.info("[harness] Cleared all state");
  }

  function dismissFullscreen() {
    if (!current) return;
    current.sendNotification("EARTHQUAKE_DISMISS_FULLSCREEN");
    Log.info("[harness] Fullscreen overlay dismissed");
    renderState();
  }

  // ─── Live data (via server proxy) ────────────────────────────────
  async function fetchLive({ initial }) {
    try {
      const res = await fetch("/api/p2pquake?limit=10&codes=551&codes=552&codes=556");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const items = await res.json();
      if (!Array.isArray(items)) throw new Error("unexpected payload");

      if (initial) {
        items.forEach((i) => i.id && liveSeenIds.add(i.id));
        Log.info(
          "[harness] Live: baseline established (" + items.length +
          " events marked as already seen)"
        );
        // Hand the backlog over so list mode can populate
        current.socketNotificationReceived("INITIAL_DATA", items);
        return;
      }

      const fresh = items.filter((i) => !i.id || !liveSeenIds.has(i.id)).reverse();
      if (fresh.length === 0) {
        Log.debug("[harness] Live: no new events");
        return;
      }
      fresh.forEach((i) => {
        if (i.id) liveSeenIds.add(i.id);
        dispatchToModule(i);
      });
    } catch (e) {
      Log.error("[harness] Live fetch failed: " + e.message);
    }
  }

  function setLiveMode(enabled) {
    if (livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
    if (!enabled) {
      Log.info("[harness] Live mode OFF");
      return;
    }
    liveSeenIds.clear();
    Log.info("[harness] Live mode ON — polling P2P地震情報 API every 30s");
    fetchLive({ initial: true });
    livePollTimer = setInterval(() => fetchLive({ initial: false }), 30000);
  }

  // ─── State inspector ─────────────────────────────────────────────
  function renderState() {
    const el = document.getElementById("state");
    if (!el || !current) return;

    const mount = document.getElementById("module-mount");
    const isNotif = current._isNotificationMode && current._isNotificationMode();
    const notifs = current.notifications || [];
    const now = Date.now();

    const rows = [
      ["displayMode", current.config.displayMode],
      ["module visible", mount.classList.contains("module-hidden") ? "no (hidden)" : "yes"],
      ["rendered nodes", mount.firstChild ? mount.firstChild.children.length : 0],
      ["lockStrings", JSON.stringify(current.lockStrings)],
    ];

    if (isNotif) {
      rows.push(["active notifications", notifs.length]);
      rows.push(["ticker running", current._notifTimer ? "yes" : "no"]);
    } else {
      rows.push(["quakes", (current.quakes || []).length]);
      rows.push(["eew alerts", (current.eewAlerts || []).length]);
      rows.push(["tsunami", (current.tsunamiWarnings || []).length]);
    }

    rows.push([
      "fullscreen overlay",
      current.fullscreenAlert
        ? '<span class="blinking">表示中</span> — ' + current.fullscreenAlert.title
        : "なし",
    ]);

    let html = '<table class="state-table">';
    rows.forEach(([k, v]) => {
      html += "<tr><th>" + k + "</th><td>" + v + "</td></tr>";
    });
    html += "</table>";

    if (isNotif && notifs.length > 0) {
      html += '<div class="state-notifs">';
      notifs.forEach((n) => {
        const remain = Math.max(0, Math.round((n.expiresAt - now) / 1000));
        const blinking = now < n.blinkUntil;
        html +=
          '<div class="state-notif">' +
          "<code>" + n.type + "</code> sev=" + n.severity +
          " · 残り <b>" + remain + "s</b>" +
          (blinking ? ' · <span class="blinking">点滅中</span>' : "") +
          "<br><span class=\"dim\">" + n.title + "</span>" +
          "</div>";
      });
      html += "</div>";
    }

    el.innerHTML = html;
  }

  // Refresh the inspector every second so countdowns are visible
  setInterval(renderState, 1000);

  // ─── Build scenario buttons from the module's own catalogue ──────
  function buildScenarioButtons() {
    const groups = PreviewFixtures.grouped();
    const spec = [
      { id: "scenarios-quake", items: groups.quake },
      { id: "scenarios-eew", items: groups.eew },
      { id: "scenarios-tsunami", items: groups.tsunami },
    ];

    spec.forEach(({ id, items }) => {
      const host = document.getElementById(id);
      if (!host) return;
      host.innerHTML = "";

      items.forEach((s) => {
        const btn = document.createElement("button");
        btn.className = "btn";

        // Colour-code by expected severity
        if (s.cancelled || s.stale) btn.classList.add("btn-muted");
        else if (s.code === 556) btn.classList.add("btn-danger");
        else if (s.code === 552) {
          btn.classList.add(s.name === "tsunamiMajor" ? "btn-danger" : "btn-warn");
        } else if (s.scale >= 55) btn.classList.add("btn-danger");
        else if (s.scale >= 45) btn.classList.add("btn-warn");

        btn.textContent = s.label;

        const kbd = document.createElement("span");
        kbd.className = "btn-key";
        kbd.textContent = "^⇧" + s.key;
        btn.appendChild(kbd);

        btn.addEventListener("click", () => inject(s.name));
        host.appendChild(btn);
      });
    });
  }

  // ─── Wire up UI ──────────────────────────────────────────────────
  function init() {
    buildScenarioButtons();

    document.getElementById("btn-clear").addEventListener("click", clearAll);
    document.getElementById("btn-apply").addEventListener("click", rebuild);
    document.getElementById("btn-dismiss-fs").addEventListener("click", dismissFullscreen);
    document.getElementById("btn-bus-test").addEventListener("click",
      () => injectViaBus("quake7"));

    document.getElementById("live-toggle").addEventListener("change", (e) => {
      setLiveMode(e.target.checked);
    });

    // Config changes rebuild the module
    document.querySelectorAll("#controls input").forEach((input) => {
      if (input.id === "live-toggle") return;
      input.addEventListener("change", rebuild);
    });

    // Duration slider live label
    const dur = document.getElementById("notificationDuration");
    const durLabel = document.getElementById("notificationDuration-label");
    const syncDur = () => {
      const s = Number(dur.value);
      durLabel.textContent = s >= 60
        ? (s / 60).toFixed(s % 60 === 0 ? 0 : 1) + "分 (" + s + "秒)"
        : s + "秒";
    };
    dur.addEventListener("input", syncDur);
    syncDur();

    rebuild();
    Log.info("[harness] Preview ready. Inject an event to see the notification.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for console-driven / automated checks
  window.__preview = {
    inject,
    injectViaBus,
    clearAll,
    rebuild,
    dismissFullscreen,
    getInstance: () => current,
    getNotifications: () => (current ? current.notifications : []),
    getFullscreen: () => (current ? current.fullscreenAlert : null),
  };
})();
