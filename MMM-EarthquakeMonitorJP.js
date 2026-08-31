/* MagicMirror²
 * Module: MMM-EarthquakeMonitorJP
 *
 * Real-time earthquake monitoring for Japan using P2P Quake API.
 * Displays earthquake information, tsunami warnings, and EEW alerts.
 *
 * MIT Licensed.
 */

Module.register("MMM-EarthquakeMonitorJP", {

  defaults: {
    // Display mode: "list" (show all information) | "notification" (transient alerts only)
    displayMode: "list",

    // Display
    maxQuakes: 5,               // Maximum number of earthquakes to display
    maxAge: 24,                 // Maximum age of earthquakes in hours
    minScale: -1,               // Minimum seismic intensity to display (-1 = all)
    animationSpeed: 1000,       // DOM update animation speed in ms

    // Data sources
    useWebSocket: true,         // Use WebSocket for real-time updates
    useRESTFallback: true,      // Use REST API as fallback / initial load
    restUpdateInterval: 5 * 60, // REST API polling interval in seconds (5 min)

    // Display toggles
    showEEW: true,              // Show Early Earthquake Warnings (EEW)
    showTsunami: true,          // Show tsunami warnings
    showQuakeInfo: true,        // Show earthquake information
    showPointDetails: false,    // Show observation point details
    showTimestamp: true,        // Show timestamps
    showMagnitude: true,        // Show magnitude
    showDepth: true,            // Show depth
    showTsunamiStatus: true,    // Show domestic tsunami status

    // Style
    compactMode: false,         // Use compact single-line display
    colorizeByScale: true,      // Colorize intensity display
    blinkOnEEW: true,           // Blink animation on EEW alerts
    showIcon: true,             // Show seismic intensity icon

    // ─── Notification mode options (displayMode: "notification") ───
    notificationDuration: 5 * 60,   // Seconds to keep a notification visible (5 min)
    notificationEEWDuration: 0,     // Override duration for EEW (0 = use notificationDuration)
    notificationTsunamiDuration: 0, // Override duration for tsunami (0 = use notificationDuration)
    notificationMaxItems: 1,        // Max simultaneous notifications (newest first)
    notificationMinScale: -1,       // Minimum intensity that triggers a notification
    notificationFreshness: 10 * 60, // Ignore events older than this many seconds (0 = disabled)
    notificationBlink: true,        // Blink the notification while it is displayed
    notificationBlinkDuration: 30,  // Seconds to keep blinking (0 = whole lifetime)
    notificationCompact: true,      // Single-line layout suited for top_bar
    notificationShowCountdown: true,// Show a remaining-time progress bar
    notifyOnInitialLoad: false,     // Also notify for the backlog fetched at startup

    // ─── Fullscreen alert (MagicMirror "alert" module style) ────────
    fullscreenAlert: false,         // Enable fullscreen overlay for major events
    fullscreenMinSeverity: 3,       // Minimum severity to go fullscreen (1-3)
    fullscreenMinScale: 45,         // Minimum intensity for quakes (45 = 震度5弱)
    fullscreenDuration: 30,         // Seconds the overlay stays up (0 = until expiry)
    fullscreenOnEEW: true,          // Always go fullscreen on an EEW warning
    fullscreenOnTsunamiWarning: true, // Always go fullscreen on 津波警報/大津波警報
    fullscreenBlink: true,          // Pulse the overlay background
    fullscreenDimBackground: true,  // Darken everything behind the overlay

    // ─── Test / demo mode ──────────────────────────────────────────
    testMode: false,                // Enable the in-situ test harness
    testHotkeys: true,              // Ctrl+Shift+<key> triggers scenarios
    testAutoRun: false,             // Cycle through scenarios automatically
    testAutoRunInterval: 20,        // Seconds between auto-run scenarios
    testShowBadge: true,            // Show a "TEST MODE" indicator
    testScenarioOnStart: null,      // Scenario name to fire once after startup
    testStartDelay: 3,              // Delay before testScenarioOnStart (seconds)

    // Advanced
    wsEndpoint: "wss://api.p2pquake.net/v2/ws",
    restEndpoint: "https://api.p2pquake.net/v2",
  },

  // Required styles
  getStyles() {
    return ["MMM-EarthquakeMonitorJP.css"];
  },

  // ══════════════════════════════════════════════════════════════════
  // Test scenarios — single source of truth, shared by the in-situ test
  // mode and the standalone preview server.
  // ══════════════════════════════════════════════════════════════════
  testScenarios: {
    quake2:      { key: "1", label: "震度2 千葉県北西部",     code: 551, scale: 20, place: "千葉県北西部", magnitude: 3.2, depth: 80 },
    quake3:      { key: "2", label: "震度3 宮古島近海",       code: 551, scale: 30, place: "宮古島近海", magnitude: 4.0, depth: 50 },
    quake4:      { key: "3", label: "震度4 茨城県沖",         code: 551, scale: 40, place: "茨城県沖", magnitude: 5.1, depth: 40 },
    quake5:      { key: "4", label: "震度5強 石川県能登地方", code: 551, scale: 50, place: "石川県能登地方", magnitude: 6.2, depth: 10, tsunami: "Checking" },
    quake6:      { key: "5", label: "震度6強 熊本県熊本地方", code: 551, scale: 60, place: "熊本県熊本地方", magnitude: 7.3, depth: 12, tsunami: "None" },
    quake7:      { key: "6", label: "震度7 宮城県沖",         code: 551, scale: 70, place: "宮城県沖", magnitude: 8.1, depth: 20, tsunami: "Warning" },
    quakeStale:  { key: "0", label: "古い地震(30分前・無視)", code: 551, scale: 30, place: "和歌山県北部", magnitude: 3.8, depth: 60, ageSec: 1800 },
    eew:         { key: "E", label: "緊急地震速報(警報)",     code: 556, place: "宗谷地方北部", magnitude: 5.5, depth: 10 },
    eewCancel:   { key: "C", label: "緊急地震速報 取消",      code: 556, place: "宗谷地方北部", magnitude: 5.5, depth: 10, cancelled: true },
    tsunamiWatch:{ key: "T", label: "津波注意報",             code: 552, grade: "Watch" },
    tsunamiMajor:{ key: "M", label: "大津波警報",             code: 552, grade: "MajorWarning" },
    tsunamiCancel:{ key: "X", label: "津波予報 解除",          code: 552, cancelled: true },
  },

  /**
   * Format a Date as a P2P Quake timestamp ("2026/08/29 14:02:15").
   * The API always reports JST, and _parseP2PTime() parses it as JST, so
   * emit JST explicitly rather than relying on the mirror's local timezone.
   */
  _toP2PTime(date) {
    const p = (n) => String(n).padStart(2, "0");
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return (
      jst.getUTCFullYear() + "/" + p(jst.getUTCMonth() + 1) + "/" +
      p(jst.getUTCDate()) + " " + p(jst.getUTCHours()) + ":" +
      p(jst.getUTCMinutes()) + ":" + p(jst.getUTCSeconds())
    );
  },

  /**
   * Build a synthetic P2P Quake payload for the named scenario.
   * Returns null for an unknown name.
   */
  buildTestPayload(name) {
    const s = this.testScenarios[name];
    if (!s) return null;

    this._testSeq = (this._testSeq || 0) + 1;
    const now = new Date(Date.now() - (s.ageSec || 0) * 1000);
    const stamp = this._toP2PTime(now);
    const id = "test-" + name + "-" + Date.now() + "-" + this._testSeq;

    if (s.code === 551) {
      return {
        code: 551,
        id: id,
        time: stamp,
        comments: { freeFormComment: "【テスト】これはテスト用の模擬データです" },
        issue: { correct: "None", source: "テスト", time: stamp, type: "DetailScale" },
        earthquake: {
          time: stamp,
          domesticTsunami: s.tsunami || "None",
          foreignTsunami: "Unknown",
          maxScale: s.scale,
          hypocenter: {
            name: s.place, magnitude: s.magnitude, depth: s.depth,
            latitude: 35.0, longitude: 139.0,
          },
        },
        points: [{ addr: s.place + "付近", isArea: false, pref: "―", scale: s.scale }],
        _isTest: true,
      };
    }

    if (s.code === 556) {
      return {
        code: 556,
        id: id,
        time: stamp,
        cancelled: !!s.cancelled,
        issue: { eventId: "test-ev-" + this._testSeq, serial: "1", time: stamp, type: "Full" },
        earthquake: {
          originTime: stamp, arrivalTime: stamp, condition: "",
          hypocenter: {
            name: s.place, magnitude: s.magnitude, depth: s.depth,
            latitude: 38.0, longitude: 142.0, reduceName: s.place,
          },
        },
        areas: s.cancelled ? [] : [
          { pref: "北海道", name: "上川地方北部", scaleFrom: 45, scaleTo: 50 },
          { pref: "北海道", name: "宗谷地方北部", scaleFrom: 40, scaleTo: 45 },
          { pref: "北海道", name: "留萌地方中北部", scaleFrom: 30, scaleTo: 40 },
        ],
        _isTest: true,
      };
    }

    if (s.code === 552) {
      const grade = s.grade || "Watch";
      return {
        code: 552,
        id: id,
        time: stamp,
        cancelled: !!s.cancelled,
        issue: { source: "テスト", time: stamp, type: "Focus" },
        areas: s.cancelled ? [] : [
          {
            grade: grade, immediate: grade === "MajorWarning",
            name: grade === "MajorWarning" ? "宮城県" : "青森県太平洋沿岸",
            maxHeight: {
              description: grade === "MajorWarning" ? "１０ｍ以上" : "１ｍ",
              value: grade === "MajorWarning" ? 10 : 1,
            },
          },
        ],
        _isTest: true,
      };
    }

    return null;
  },

  /**
   * Feed a scenario through the exact same path as live API data, so the
   * test exercises the real code path rather than a shortcut.
   */
  runTestScenario(name) {
    const payload = this.buildTestPayload(name);
    if (!payload) {
      Log.warn("[MMM-EarthquakeMonitorJP] Unknown test scenario: " + name);
      return false;
    }

    const route = { 551: "QUAKE_DATA", 552: "TSUNAMI_DATA", 556: "EEW_DATA" };
    Log.info(
      "[MMM-EarthquakeMonitorJP] TEST scenario '" + name + "' → " + route[payload.code]
    );
    this.socketNotificationReceived(route[payload.code], payload);
    return true;
  },

  start() {
    Log.info("[MMM-EarthquakeMonitorJP] Starting module");
    this.quakes = [];
    this.eewAlerts = [];
    this.tsunamiWarnings = [];
    this.connectionStatus = "disconnected";
    this.loaded = false;

    // Notification mode state
    this.notifications = [];   // Active transient notifications
    this._notifSeq = 0;        // Monotonic id generator
    this._notifTimer = null;   // Shared expiry/refresh ticker

    // Fullscreen overlay state
    this.fullscreenAlert = null;   // Currently displayed overlay payload
    this._fullscreenTimer = null;
    this._overlayEl = null;

    // Send config to node_helper
    this.sendSocketNotification("CONFIG", this.config);

    if (this.config.testMode) {
      this._initTestMode();
    }
  },

  // ─── Test mode bootstrap (runs inside a real MagicMirror) ────────
  _initTestMode() {
    Log.warn(
      "[MMM-EarthquakeMonitorJP] ⚠ TEST MODE ENABLED — synthetic data will be displayed. " +
      "Set testMode:false for production use."
    );

    // 1) Console API: MMMEarthquakeTest.run("quake7") from DevTools
    if (typeof window !== "undefined") {
      window.MMMEarthquakeTest = {
        run: (name) => this.runTestScenario(name),
        list: () => Object.keys(this.testScenarios).map((k) => ({
          name: k,
          key: this.testScenarios[k].key,
          label: this.testScenarios[k].label,
        })),
        clear: () => this._clearAllForTest(),
        module: this,
      };
      Log.info(
        "[MMM-EarthquakeMonitorJP] Test API ready: " +
        "MMMEarthquakeTest.run('quake7') / .list() / .clear()"
      );
    }

    // 2) Keyboard hotkeys: Ctrl+Shift+<key>
    if (this.config.testHotkeys && typeof document !== "undefined") {
      this._testKeyHandler = (event) => {
        if (!event.ctrlKey || !event.shiftKey) return;
        const pressed = String(event.key || "").toUpperCase();
        const match = Object.keys(this.testScenarios).find(
          (n) => this.testScenarios[n].key.toUpperCase() === pressed
        );
        if (match) {
          event.preventDefault();
          this.runTestScenario(match);
        } else if (pressed === "Q") {
          event.preventDefault();
          this._clearAllForTest();
        }
      };
      document.addEventListener("keydown", this._testKeyHandler);
      Log.info(
        "[MMM-EarthquakeMonitorJP] Test hotkeys active: Ctrl+Shift+1..6 / E / T / M / Q(clear)"
      );
    }

    // 3) Fire a single scenario shortly after startup
    if (this.config.testScenarioOnStart) {
      setTimeout(() => {
        this.runTestScenario(this.config.testScenarioOnStart);
      }, Math.max(0, this.config.testStartDelay) * 1000);
    }

    // 4) Auto-run: cycle through every scenario
    if (this.config.testAutoRun) {
      const names = Object.keys(this.testScenarios);
      let i = 0;
      this._testAutoRunTimer = setInterval(() => {
        this.runTestScenario(names[i % names.length]);
        i++;
      }, Math.max(5, this.config.testAutoRunInterval) * 1000);
    }
  },

  _clearAllForTest() {
    this.notifications = [];
    this.quakes = [];
    this.eewAlerts = [];
    this.tsunamiWarnings = [];
    this._stopNotificationTicker();
    this._dismissFullscreenAlert();
    if (this._isNotificationMode()) {
      this._refreshNotificationView();
    } else {
      this.updateDom(0);
    }
    Log.info("[MMM-EarthquakeMonitorJP] TEST: state cleared");
  },

  suspend() {
    // Stop the ticker while the module is hidden to save resources
    this._stopNotificationTicker();
    // A fullscreen overlay must never outlive the module being hidden
    this._dismissFullscreenAlert();
  },

  resume() {
    if (this._isNotificationMode() && this.notifications.length > 0) {
      this._startNotificationTicker();
    }
  },

  _isNotificationMode() {
    return this.config.displayMode === "notification";
  },

  // ─── DOM Generation ──────────────────────────────────────────────
  getDom() {
    if (this._isNotificationMode()) {
      return this._getNotificationDom();
    }
    return this._getListDom();
  },

  // ─── DOM: List mode (default, shows everything) ──────────────────
  _getListDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "earthquake-monitor-jp";

    if (this.config.testMode && this.config.testShowBadge) {
      wrapper.appendChild(this._buildTestBadgeDom());
    }

    // Connection status indicator (only when disconnected)
    if (this.connectionStatus === "disconnected" && !this.loaded) {
      const loading = document.createElement("div");
      loading.className = "eq-loading dimmed small";
      loading.textContent = "地震情報を取得中...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    // ── EEW Alerts (Highest priority) ──
    if (this.config.showEEW && this.eewAlerts.length > 0) {
      this.eewAlerts.forEach((eew) => {
        wrapper.appendChild(this._buildEEWDom(eew));
      });
    }

    // ── Tsunami Warnings ──
    if (this.config.showTsunami && this.tsunamiWarnings.length > 0) {
      this.tsunamiWarnings.forEach((tsunami) => {
        wrapper.appendChild(this._buildTsunamiDom(tsunami));
      });
    }

    // ── Earthquake Information ──
    if (this.config.showQuakeInfo && this.quakes.length > 0) {
      this.quakes.forEach((quake) => {
        wrapper.appendChild(this._buildQuakeDom(quake));
      });
    }

    // Nothing to show. The test badge is chrome, not content, so it must
    // not keep an otherwise-empty module visible.
    const contentCount = wrapper.children.filter
      ? wrapper.children.filter((c) => !c.classList.contains("eq-test-badge")).length
      : Array.prototype.filter.call(
          wrapper.children,
          (c) => !c.classList.contains("eq-test-badge")
        ).length;

    if (contentCount === 0 && !this.config.testMode) {
      wrapper.style.display = "none";
    }

    return wrapper;
  },

  // ─── DOM: Notification mode (transient alerts only) ──────────────
  _getNotificationDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "earthquake-monitor-jp eq-notify-mode";

    const showBadge = this.config.testMode && this.config.testShowBadge;

    // No active notification → render nothing at all
    if (this.notifications.length === 0) {
      wrapper.className += " eq-notify-empty";
      // In test mode keep a marker visible so the operator can confirm
      // the module is alive even while idle.
      if (showBadge) {
        wrapper.classList.remove("eq-notify-empty");
        wrapper.classList.add("eq-notify-idle-test");
        wrapper.appendChild(this._buildTestBadgeDom());
      }
      return wrapper;
    }

    if (this.config.notificationCompact) {
      wrapper.classList.add("eq-notify-compact");
    }

    if (showBadge) {
      wrapper.appendChild(this._buildTestBadgeDom());
    }

    this.notifications.forEach((notif) => {
      wrapper.appendChild(this._buildNotificationDom(notif));
    });

    return wrapper;
  },

  _buildNotificationDom(notif) {
    const now = Date.now();
    const item = document.createElement("div");
    item.className = "eq-notify eq-notify-" + notif.type;
    item.classList.add("eq-notify-sev-" + notif.severity);

    // Blink while the alert is fresh
    if (this.config.notificationBlink && now < notif.blinkUntil) {
      item.classList.add("eq-notify-blink");
    }

    const body = document.createElement("div");
    body.className = "eq-notify-body";

    // Leading badge (intensity value or alert glyph)
    const badge = document.createElement("span");
    badge.className = "eq-notify-badge";
    if (notif.scale !== null && notif.scale >= 0) {
      badge.textContent = this._scaleToText(notif.scale);
      if (this.config.colorizeByScale) {
        badge.classList.add("eq-scale-" + notif.scale);
      }
    } else {
      badge.classList.add("eq-notify-badge-glyph");
      badge.innerHTML = notif.glyph;
    }
    body.appendChild(badge);

    // Text block
    const textBlock = document.createElement("div");
    textBlock.className = "eq-notify-text";

    const title = document.createElement("span");
    title.className = "eq-notify-title";
    title.textContent = notif.title;
    textBlock.appendChild(title);

    if (notif.detail) {
      const detail = document.createElement("span");
      detail.className = "eq-notify-detail small dimmed";
      detail.textContent = notif.detail;
      textBlock.appendChild(detail);
    }

    body.appendChild(textBlock);
    item.appendChild(body);

    // Remaining-time countdown bar
    if (this.config.notificationShowCountdown) {
      const total = notif.expiresAt - notif.createdAt;
      const remain = Math.max(0, notif.expiresAt - now);
      const ratio = total > 0 ? remain / total : 0;

      const track = document.createElement("div");
      track.className = "eq-notify-countdown";
      const bar = document.createElement("div");
      bar.className = "eq-notify-countdown-bar";
      bar.style.width = (ratio * 100).toFixed(1) + "%";
      track.appendChild(bar);
      item.appendChild(track);
    }

    return item;
  },

  /**
   * Escalate an event to the fullscreen overlay if it qualifies.
   * Called for both display modes, so `fullscreenAlert` works even when
   * the module is rendering the normal list.
   */
  _maybeShowFullscreenAlert(notif) {
    if (!notif) return;
    if (!this._shouldGoFullscreen(notif)) return;

    // Do not restart an identical overlay that is already up
    if (this.fullscreenAlert && this.fullscreenAlert.key === notif.key) {
      return;
    }
    this._showFullscreenAlert(notif);
  },

  // ─── Notification: push a new transient alert ────────────────────
  _pushNotification(notif) {
    if (!this._isNotificationMode()) return;

    const now = Date.now();

    // Replace an existing notification about the same event
    if (notif.key) {
      this.notifications = this.notifications.filter((n) => n.key !== notif.key);
    }

    const lifetime = Math.max(1, notif.duration) * 1000;
    let blinkSeconds = this.config.notificationBlinkDuration;
    if (!blinkSeconds || blinkSeconds <= 0) {
      blinkSeconds = notif.duration;
    }

    notif.id = ++this._notifSeq;
    notif.createdAt = now;
    notif.expiresAt = now + lifetime;
    notif.blinkUntil = now + Math.min(blinkSeconds, notif.duration) * 1000;

    this.notifications.unshift(notif);

    // Highest severity first, then newest first
    this.notifications.sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return b.createdAt - a.createdAt;
    });

    const maxItems = Math.max(1, this.config.notificationMaxItems);
    this.notifications = this.notifications.slice(0, maxItems);

    Log.info(
      "[MMM-EarthquakeMonitorJP] Notification: " + notif.title +
      " (" + notif.duration + "s)"
    );

    this._startNotificationTicker();
    this._refreshNotificationView();
  },

  // ─── Notification: periodic expiry / countdown refresh ───────────
  _startNotificationTicker() {
    if (this._notifTimer) return;
    this._notifTimer = setInterval(() => {
      this._tickNotifications();
    }, 1000);
  },

  _stopNotificationTicker() {
    if (this._notifTimer) {
      clearInterval(this._notifTimer);
      this._notifTimer = null;
    }
  },

  _tickNotifications() {
    const now = Date.now();
    const before = this.notifications.length;

    this.notifications = this.notifications.filter((n) => n.expiresAt > now);

    if (this.notifications.length === 0) {
      this._stopNotificationTicker();
      if (before > 0) {
        // Last notification expired → disappear completely
        this._refreshNotificationView();
      }
      return;
    }

    // Keep countdown bar / blink state in sync
    this._refreshNotificationView();
  },

  _refreshNotificationView() {
    const hasContent = this.notifications.length > 0;

    // Hide the whole module (incl. header) while there is nothing to report
    if (hasContent) {
      this.show(this.config.animationSpeed, { lockString: "eqNotify" });
    } else {
      this.hide(this.config.animationSpeed, { lockString: "eqNotify" });
    }

    // Countdown ticks should not re-trigger the fade animation every second
    this.updateDom(0);
  },

  // ─── Notification builders ───────────────────────────────────────
  _notificationDurationFor(type) {
    const base = this.config.notificationDuration;
    if (type === "eew" && this.config.notificationEEWDuration > 0) {
      return this.config.notificationEEWDuration;
    }
    if (type === "tsunami" && this.config.notificationTsunamiDuration > 0) {
      return this.config.notificationTsunamiDuration;
    }
    return base;
  },

  /**
   * Reject events that are not "happening now".
   * Guards against a backlog replay flooding the topbar after a restart.
   */
  _isFreshEvent(timeStr) {
    const window = this.config.notificationFreshness;
    if (!window || window <= 0) return true;
    const t = this._parseP2PTime(timeStr);
    if (!t) return true; // Unknown timestamp → do not block
    return (Date.now() - t.getTime()) <= window * 1000;
  },

  _buildQuakeNotification(quake) {
    const eq = quake.earthquake;
    if (!eq) return null;

    const scale = eq.maxScale !== undefined && eq.maxScale !== null ? eq.maxScale : -1;

    if (this.config.notificationMinScale > -1 && scale < this.config.notificationMinScale) {
      return null;
    }

    const place = (eq.hypocenter && eq.hypocenter.name) || "震源不明";
    const scaleText = this._scaleToText(scale);
    const title = scaleText ? "震度" + scaleText + " " + place : "地震情報 " + place;

    const parts = [];
    if (this.config.showMagnitude && eq.hypocenter && eq.hypocenter.magnitude > 0) {
      parts.push("M" + eq.hypocenter.magnitude.toFixed(1));
    }
    if (this.config.showDepth && eq.hypocenter && eq.hypocenter.depth >= 0) {
      parts.push("深さ " + (eq.hypocenter.depth === 0 ? "ごく浅い" : eq.hypocenter.depth + "km"));
    }
    if (this.config.showTimestamp && eq.time) {
      parts.push(this._formatTime(eq.time));
    }
    if (this.config.showTsunamiStatus && eq.domesticTsunami) {
      const tsunamiText = this._tsunamiStatusToText(eq.domesticTsunami);
      if (tsunamiText) parts.push(tsunamiText);
    }

    return {
      key: "quake:" + (quake.id || place + eq.time),
      type: "quake",
      // 1 = info, 2 = caution (震度5弱〜5強), 3 = warning (震度6弱以上)
      severity: scale >= 55 ? 3 : (scale >= 45 ? 2 : 1),
      scale: scale,
      glyph: "&#x1F30F;",
      title: title,
      detail: parts.join(" / "),
      duration: this._notificationDurationFor("quake"),
    };
  },

  _buildEEWNotification(eew) {
    const eq = eew.earthquake || {};
    const hypo = eq.hypocenter || {};

    if (eew.cancelled) {
      return {
        key: "eew:" + ((eew.issue && eew.issue.eventId) || "unknown"),
        type: "eew-cancelled",
        severity: 1,
        scale: null,
        glyph: "&#x26A0;",
        title: "緊急地震速報 取消",
        detail: "先ほどの緊急地震速報は取り消されました",
        duration: Math.min(60, this._notificationDurationFor("eew")),
      };
    }

    const parts = [];
    if (hypo.magnitude > 0) parts.push("M" + hypo.magnitude.toFixed(1));
    if (hypo.depth >= 0) {
      parts.push("深さ " + (hypo.depth === 0 ? "ごく浅い" : hypo.depth + "km"));
    }
    if (eew.areas && eew.areas.length > 0) {
      const areaNames = eew.areas.slice(0, 3).map((a) => a.name);
      let areaText = areaNames.join("、");
      if (eew.areas.length > 3) areaText += " ほか";
      parts.push(areaText);
    }

    return {
      key: "eew:" + ((eew.issue && eew.issue.eventId) || Date.now()),
      type: "eew",
      severity: 3,
      scale: null,
      glyph: "&#x26A0;",
      title: "緊急地震速報 " + (hypo.name || "震源調査中"),
      detail: parts.join(" / "),
      duration: this._notificationDurationFor("eew"),
    };
  },

  _buildTsunamiNotification(tsunami) {
    if (tsunami.cancelled) {
      return {
        key: "tsunami",
        type: "tsunami-cancelled",
        severity: 1,
        scale: null,
        glyph: "&#x1F30A;",
        title: "津波予報 解除",
        detail: "",
        duration: Math.min(60, this._notificationDurationFor("tsunami")),
      };
    }

    let maxGrade = "Watch";
    if (tsunami.areas) {
      tsunami.areas.forEach((a) => {
        if (a.grade === "MajorWarning") maxGrade = "MajorWarning";
        else if (a.grade === "Warning" && maxGrade !== "MajorWarning") maxGrade = "Warning";
      });
    }

    const gradeText = {
      MajorWarning: "大津波警報",
      Warning: "津波警報",
      Watch: "津波注意報",
    };

    const areaNames = (tsunami.areas || []).slice(0, 3).map((a) => a.name);
    let detail = areaNames.join("、");
    if (tsunami.areas && tsunami.areas.length > 3) detail += " ほか";

    return {
      key: "tsunami",
      type: "tsunami",
      severity: maxGrade === "Watch" ? 2 : 3,
      scale: null,
      glyph: "&#x1F30A;",
      title: gradeText[maxGrade] || "津波予報",
      detail: detail,
      duration: this._notificationDurationFor("tsunami"),
    };
  },

  // ══════════════════════════════════════════════════════════════════
  // Fullscreen alert overlay (MagicMirror "alert" module style)
  //
  // Rendered outside this module's own DOM so it can cover the whole
  // mirror regardless of the module's configured `position`.
  // ══════════════════════════════════════════════════════════════════

  /**
   * Decide whether an event deserves the fullscreen treatment.
   */
  _shouldGoFullscreen(notif) {
    if (!this.config.fullscreenAlert) return false;

    // Cancellations are never escalated to fullscreen
    if (notif.type === "eew-cancelled" || notif.type === "tsunami-cancelled") {
      return false;
    }

    // Explicit always-on rules
    if (notif.type === "eew" && this.config.fullscreenOnEEW) return true;
    if (
      notif.type === "tsunami" &&
      this.config.fullscreenOnTsunamiWarning &&
      notif.severity >= 3
    ) {
      return true;
    }

    // Earthquakes are gated by intensity
    if (notif.type === "quake") {
      if (notif.scale === null || notif.scale < 0) return false;
      return notif.scale >= this.config.fullscreenMinScale;
    }

    // Generic severity threshold
    return notif.severity >= this.config.fullscreenMinSeverity;
  },

  _showFullscreenAlert(notif) {
    if (typeof document === "undefined") return;

    this._dismissFullscreenAlert();
    this.fullscreenAlert = notif;

    const overlay = document.createElement("div");
    overlay.className = "eq-fullscreen eq-fullscreen-sev-" + notif.severity;
    overlay.id = "eq-fullscreen-overlay";
    if (this.config.fullscreenDimBackground) {
      overlay.classList.add("eq-fullscreen-dim");
    }
    if (this.config.fullscreenBlink) {
      overlay.classList.add("eq-fullscreen-blink");
    }

    const inner = document.createElement("div");
    inner.className = "eq-fullscreen-inner";

    // Big warning glyph
    const glyph = document.createElement("div");
    glyph.className = "eq-fullscreen-glyph";
    glyph.innerHTML = notif.glyph;
    inner.appendChild(glyph);

    // Headline
    const title = document.createElement("div");
    title.className = "eq-fullscreen-title";
    title.textContent = notif.title;
    inner.appendChild(title);

    // Giant intensity badge for earthquakes
    if (notif.scale !== null && notif.scale >= 0) {
      const scaleWrap = document.createElement("div");
      scaleWrap.className = "eq-fullscreen-scale";

      const label = document.createElement("span");
      label.className = "eq-fullscreen-scale-label";
      label.textContent = "最大震度";
      scaleWrap.appendChild(label);

      const value = document.createElement("span");
      value.className = "eq-fullscreen-scale-value";
      if (this.config.colorizeByScale) {
        value.classList.add("eq-scale-" + notif.scale);
      }
      value.textContent = this._scaleToText(notif.scale);
      scaleWrap.appendChild(value);

      inner.appendChild(scaleWrap);
    }

    // Detail line
    if (notif.detail) {
      const detail = document.createElement("div");
      detail.className = "eq-fullscreen-detail";
      detail.textContent = notif.detail;
      inner.appendChild(detail);
    }

    // Safety call-to-action
    const action = document.createElement("div");
    action.className = "eq-fullscreen-action";
    action.textContent = this._fullscreenActionText(notif);
    inner.appendChild(action);

    // Test-data marker so a demo is never mistaken for a real alert
    if (notif.isTest) {
      const testTag = document.createElement("div");
      testTag.className = "eq-fullscreen-test";
      testTag.textContent = "TEST DATA — これはテストです";
      inner.appendChild(testTag);
    }

    overlay.appendChild(inner);

    // Countdown bar across the bottom
    const duration = this._fullscreenDurationFor(notif);
    if (duration > 0) {
      const track = document.createElement("div");
      track.className = "eq-fullscreen-countdown";
      const bar = document.createElement("div");
      bar.className = "eq-fullscreen-countdown-bar";
      // Drive the shrink purely in CSS for smoothness
      bar.style.animation = "eq-fullscreen-countdown-anim " + duration + "s linear forwards";
      track.appendChild(bar);
      overlay.appendChild(track);
    }

    // Normally the mirror's <body>; the preview page overrides this so the
    // overlay stays inside the simulated mirror frame.
    const host = this._overlayHost || document.body;
    host.appendChild(overlay);
    this._overlayEl = overlay;

    Log.info(
      "[MMM-EarthquakeMonitorJP] Fullscreen alert: " + notif.title +
      " (" + duration + "s)"
    );

    if (duration > 0) {
      this._fullscreenTimer = setTimeout(() => {
        this._dismissFullscreenAlert();
      }, duration * 1000);
    }
  },

  _fullscreenDurationFor(notif) {
    if (this.config.fullscreenDuration > 0) {
      return this.config.fullscreenDuration;
    }
    // 0 → follow the notification's own lifetime
    return notif.duration;
  },

  _fullscreenActionText(notif) {
    if (notif.type === "eew") return "強い揺れに備えてください";
    if (notif.type === "tsunami") {
      return notif.severity >= 3
        ? "ただちに高台へ避難してください"
        : "海岸から離れてください";
    }
    // 震度5弱以上は家具の転倒などで負傷の恐れがあるため、安全確保を促す
    if (notif.scale !== null && notif.scale >= 45) {
      return "身の安全を確保してください";
    }
    return "落ち着いて行動してください";
  },

  _dismissFullscreenAlert() {
    if (this._fullscreenTimer) {
      clearTimeout(this._fullscreenTimer);
      this._fullscreenTimer = null;
    }
    if (this._overlayEl) {
      if (this._overlayEl.parentNode) {
        this._overlayEl.parentNode.removeChild(this._overlayEl);
      }
      this._overlayEl = null;
    }
    // Clean up a stale overlay left behind by a previous instance
    if (typeof document !== "undefined" && document.getElementById) {
      const stale = document.getElementById("eq-fullscreen-overlay");
      if (stale && stale.parentNode) {
        stale.parentNode.removeChild(stale);
      }
    }
    this.fullscreenAlert = null;
  },

  // ─── Test mode badge ─────────────────────────────────────────────
  _buildTestBadgeDom() {
    const badge = document.createElement("div");
    badge.className = "eq-test-badge";
    badge.textContent = "TEST MODE";
    return badge;
  },

  // ─── Build EEW DOM ───────────────────────────────────────────────
  _buildEEWDom(eew) {
    const container = document.createElement("div");
    container.className = "eq-eew";
    if (this.config.blinkOnEEW) {
      container.classList.add("eq-blink");
    }

    const header = document.createElement("div");
    header.className = "eq-eew-header";
    header.innerHTML = '<span class="eq-eew-icon">&#x26A0;</span> 緊急地震速報（警報）';
    container.appendChild(header);

    if (eew.cancelled) {
      const cancel = document.createElement("div");
      cancel.className = "eq-eew-cancelled";
      cancel.textContent = "この緊急地震速報は取り消されました";
      container.appendChild(cancel);
      container.classList.remove("eq-blink");
      return container;
    }

    if (eew.earthquake) {
      const eq = eew.earthquake;
      const info = document.createElement("div");
      info.className = "eq-eew-info";

      if (eq.hypocenter && eq.hypocenter.name) {
        const loc = document.createElement("span");
        loc.className = "eq-eew-location";
        loc.textContent = eq.hypocenter.name;
        info.appendChild(loc);
      }

      if (eq.hypocenter && eq.hypocenter.magnitude > 0) {
        const mag = document.createElement("span");
        mag.className = "eq-eew-magnitude";
        mag.textContent = " M" + eq.hypocenter.magnitude.toFixed(1);
        info.appendChild(mag);
      }

      container.appendChild(info);
    }

    // EEW warning areas
    if (eew.areas && eew.areas.length > 0) {
      const areasDiv = document.createElement("div");
      areasDiv.className = "eq-eew-areas small";
      const areaNames = eew.areas.map((a) => {
        const scaleText = this._scaleToText(a.scaleFrom);
        return a.name + (scaleText ? "(" + scaleText + ")" : "");
      });
      areasDiv.textContent = areaNames.join("、");
      container.appendChild(areasDiv);
    }

    return container;
  },

  // ─── Build Tsunami DOM ───────────────────────────────────────────
  _buildTsunamiDom(tsunami) {
    const container = document.createElement("div");
    container.className = "eq-tsunami";

    const header = document.createElement("div");
    header.className = "eq-tsunami-header";

    if (tsunami.cancelled) {
      header.innerHTML = '<span class="eq-tsunami-icon">&#x1F30A;</span> 津波予報 解除';
      container.appendChild(header);
      return container;
    }

    // Determine the highest grade
    let maxGrade = "Watch";
    if (tsunami.areas) {
      tsunami.areas.forEach((a) => {
        if (a.grade === "MajorWarning") maxGrade = "MajorWarning";
        else if (a.grade === "Warning" && maxGrade !== "MajorWarning") maxGrade = "Warning";
      });
    }

    container.classList.add("eq-tsunami-" + maxGrade.toLowerCase());

    const gradeText = {
      MajorWarning: "大津波警報",
      Warning: "津波警報",
      Watch: "津波注意報",
    };
    header.innerHTML = '<span class="eq-tsunami-icon">&#x1F30A;</span> ' + (gradeText[maxGrade] || "津波予報");
    container.appendChild(header);

    if (tsunami.areas && tsunami.areas.length > 0) {
      const areasDiv = document.createElement("div");
      areasDiv.className = "eq-tsunami-areas small";
      tsunami.areas.forEach((area) => {
        const areaItem = document.createElement("div");
        areaItem.className = "eq-tsunami-area";

        const grade = gradeText[area.grade] || area.grade;
        let text = "【" + grade + "】" + area.name;

        if (area.maxHeight && area.maxHeight.description) {
          text += " 予想高さ: " + area.maxHeight.description;
        }
        if (area.immediate) {
          text += " ただちに津波来襲";
        }

        areaItem.textContent = text;
        areasDiv.appendChild(areaItem);
      });
      container.appendChild(areasDiv);
    }

    return container;
  },

  // ─── Build Quake DOM ─────────────────────────────────────────────
  _buildQuakeDom(quake) {
    const container = document.createElement("div");
    container.className = "eq-quake";

    const eq = quake.earthquake;
    if (!eq) return container;

    // Top row: intensity + hypocenter
    const topRow = document.createElement("div");
    topRow.className = "eq-quake-top";

    // Seismic intensity badge
    if (eq.maxScale !== undefined && eq.maxScale >= 0 && this.config.showIcon) {
      const badge = document.createElement("span");
      badge.className = "eq-scale-badge";
      const scaleText = this._scaleToText(eq.maxScale);
      badge.textContent = scaleText;
      if (this.config.colorizeByScale) {
        badge.classList.add("eq-scale-" + eq.maxScale);
      }
      topRow.appendChild(badge);
    }

    // Info block
    const infoBlock = document.createElement("div");
    infoBlock.className = "eq-quake-info";

    // Hypocenter name
    if (eq.hypocenter && eq.hypocenter.name) {
      const loc = document.createElement("div");
      loc.className = "eq-quake-location";
      loc.textContent = eq.hypocenter.name;
      infoBlock.appendChild(loc);
    }

    // Details line
    const details = document.createElement("div");
    details.className = "eq-quake-details small dimmed";
    const detailParts = [];

    if (this.config.showMagnitude && eq.hypocenter && eq.hypocenter.magnitude > 0) {
      detailParts.push("M" + eq.hypocenter.magnitude.toFixed(1));
    }
    if (this.config.showDepth && eq.hypocenter && eq.hypocenter.depth >= 0) {
      detailParts.push("深さ " + (eq.hypocenter.depth === 0 ? "ごく浅い" : eq.hypocenter.depth + "km"));
    }
    if (this.config.showTimestamp && eq.time) {
      detailParts.push(this._formatTime(eq.time));
    }
    if (this.config.showTsunamiStatus && eq.domesticTsunami) {
      const tsunamiText = this._tsunamiStatusToText(eq.domesticTsunami);
      if (tsunamiText) {
        detailParts.push(tsunamiText);
      }
    }

    details.textContent = detailParts.join(" / ");
    infoBlock.appendChild(details);

    topRow.appendChild(infoBlock);
    container.appendChild(topRow);

    // Observation points (optional)
    if (this.config.showPointDetails && quake.points && quake.points.length > 0) {
      const pointsDiv = document.createElement("div");
      pointsDiv.className = "eq-quake-points xsmall dimmed";

      // Group by scale descending
      const grouped = {};
      quake.points.forEach((p) => {
        const key = p.scale;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
      });

      Object.keys(grouped)
        .sort((a, b) => b - a)
        .forEach((scale) => {
          const line = document.createElement("div");
          const scaleText = this._scaleToText(parseInt(scale, 10));
          const addrs = grouped[scale].map((p) => (p.isArea ? p.addr : p.addr)).join("、");
          line.textContent = "【" + scaleText + "】" + addrs;
          pointsDiv.appendChild(line);
        });

      container.appendChild(pointsDiv);
    }

    // Free-form comment
    if (quake.comments && quake.comments.freeFormComment) {
      const comment = document.createElement("div");
      comment.className = "eq-quake-comment xsmall dimmed";
      comment.textContent = quake.comments.freeFormComment;
      container.appendChild(comment);
    }

    return container;
  },

  // ─── Helper: Scale to Text ───────────────────────────────────────
  _scaleToText(scale) {
    const map = {
      "-1": "",
      0: "0",
      10: "1",
      20: "2",
      30: "3",
      40: "4",
      45: "5弱",
      46: "5弱以上",
      50: "5強",
      55: "6弱",
      60: "6強",
      70: "7",
      99: "～以上",
    };
    const key = String(Math.floor(scale));
    return map[key] !== undefined ? map[key] : String(scale);
  },

  // ─── Helper: Tsunami status ──────────────────────────────────────
  _tsunamiStatusToText(status) {
    if (!status) return "";
    const s = status.split("(")[0];
    const map = {
      None: "津波の心配なし",
      Unknown: "",
      Checking: "津波 調査中",
      NonEffective: "若干の海面変動あり",
      Watch: "津波注意報",
      Warning: "津波予報あり",
    };
    return map[s] !== undefined ? map[s] : "";
  },

  // ─── Helper: Format time ─────────────────────────────────────────
  _formatTime(timeStr) {
    if (!timeStr) return "";
    // P2P format: "2019/08/26 20:53:00"
    const parts = timeStr.split(" ");
    if (parts.length < 2) return timeStr;
    const dateParts = parts[0].split("/");
    const timeParts = parts[1].split(":");
    if (dateParts.length >= 3 && timeParts.length >= 2) {
      const now = new Date(Date.now());
      const month = parseInt(dateParts[1], 10);
      const day = parseInt(dateParts[2], 10);
      const isToday =
        now.getMonth() + 1 === month && now.getDate() === day;
      if (isToday) {
        return timeParts[0] + ":" + timeParts[1];
      }
      return month + "/" + day + " " + timeParts[0] + ":" + timeParts[1];
    }
    return timeStr;
  },

  // ─── Socket Notification Received ────────────────────────────────
  /**
   * MagicMirror broadcast bus. Lets other modules (MMM-Buttons,
   * MMM-Remote-Control, MMM-GoogleAssistant, …) drive the test harness:
   *
   *   this.sendNotification("EARTHQUAKE_TEST", "quake7");
   *   this.sendNotification("EARTHQUAKE_TEST_CLEAR");
   */
  notificationReceived(notification, payload) {
    if (notification === "EARTHQUAKE_TEST") {
      if (!this.config.testMode) {
        Log.warn(
          "[MMM-EarthquakeMonitorJP] EARTHQUAKE_TEST ignored — set testMode:true to enable"
        );
        return;
      }
      const name = typeof payload === "string"
        ? payload
        : (payload && payload.scenario);
      this.runTestScenario(name || "quake4");
      return;
    }

    if (notification === "EARTHQUAKE_TEST_CLEAR") {
      if (!this.config.testMode) return;
      this._clearAllForTest();
      return;
    }

    if (notification === "EARTHQUAKE_DISMISS_FULLSCREEN") {
      this._dismissFullscreenAlert();
    }
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case "QUAKE_DATA":
        this._processQuakeData(payload);
        break;
      case "EEW_DATA":
        this._processEEWData(payload);
        break;
      case "TSUNAMI_DATA":
        this._processTsunamiData(payload);
        break;
      case "CONNECTION_STATUS":
        this.connectionStatus = payload.status;
        if (payload.status === "connected") {
          this.loaded = true;
        }
        if (this._isNotificationMode()) {
          // Never show a connection placeholder in notification mode
          this._refreshNotificationView();
        } else {
          this.updateDom(this.config.animationSpeed);
        }
        break;
      case "INITIAL_DATA":
        this._processInitialData(payload);
        break;
    }
  },

  // ─── Process earthquake data ─────────────────────────────────────
  _processQuakeData(data) {
    if (!data || data.code !== 551) return;

    const isFresh = this._isFreshEvent(data.earthquake && data.earthquake.time);

    if (this._isNotificationMode()) {
      if (!this.config.showQuakeInfo) return;

      // Only alert for quakes that just happened
      if (!isFresh) {
        Log.debug("[MMM-EarthquakeMonitorJP] Skipping stale quake for notification");
        this._refreshNotificationView();
        return;
      }

      const notif = this._buildQuakeNotification(data);
      if (notif) {
        notif.isTest = !!data._isTest;
        this._pushNotification(notif);
        this._maybeShowFullscreenAlert(notif);
      } else {
        // Filtered out by notificationMinScale — stay collapsed
        this._refreshNotificationView();
      }
      return;
    }

    // ── List mode ──
    this._addOrUpdateQuake(data);
    this._pruneQuakes();
    this.loaded = true;
    this.updateDom(this.config.animationSpeed);

    // Fullscreen alerts are independent of the display mode
    if (this.config.fullscreenAlert && isFresh) {
      const notif = this._buildQuakeNotification(data);
      if (notif) {
        notif.isTest = !!data._isTest;
        this._maybeShowFullscreenAlert(notif);
      }
    }
  },

  _processEEWData(data) {
    if (!data || data.code !== 556) return;

    if (this._isNotificationMode()) {
      if (!this.config.showEEW) return;
      const notif = this._buildEEWNotification(data);
      notif.isTest = !!data._isTest;
      this._pushNotification(notif);
      this._maybeShowFullscreenAlert(notif);
      return;
    }

    // Fullscreen alerts are independent of the display mode
    if (this.config.fullscreenAlert) {
      const notif = this._buildEEWNotification(data);
      notif.isTest = !!data._isTest;
      this._maybeShowFullscreenAlert(notif);
    }

    // De-duplicate by eventId
    const eventId = data.issue ? data.issue.eventId : null;
    if (eventId) {
      this.eewAlerts = this.eewAlerts.filter(
        (e) => !(e.issue && e.issue.eventId === eventId)
      );
    }
    this.eewAlerts.unshift(data);

    // Auto-remove EEW after 3 minutes
    const self = this;
    setTimeout(() => {
      self.eewAlerts = self.eewAlerts.filter((e) => e !== data);
      self.updateDom(self.config.animationSpeed);
    }, 3 * 60 * 1000);

    this.updateDom(this.config.animationSpeed);
  },

  _processTsunamiData(data) {
    if (!data || data.code !== 552) return;

    if (this._isNotificationMode()) {
      if (!this.config.showTsunami) return;
      const notif = this._buildTsunamiNotification(data);
      notif.isTest = !!data._isTest;
      this._pushNotification(notif);
      this._maybeShowFullscreenAlert(notif);
      return;
    }

    // Fullscreen alerts are independent of the display mode
    if (this.config.fullscreenAlert) {
      const notif = this._buildTsunamiNotification(data);
      notif.isTest = !!data._isTest;
      this._maybeShowFullscreenAlert(notif);
    }

    if (data.cancelled) {
      // Show cancellation briefly then clear
      this.tsunamiWarnings = [data];
      const self = this;
      setTimeout(() => {
        self.tsunamiWarnings = [];
        self.updateDom(self.config.animationSpeed);
      }, 60 * 1000);
    } else {
      this.tsunamiWarnings = [data];
    }
    this.updateDom(this.config.animationSpeed);
  },

  _processInitialData(dataArray) {
    if (!Array.isArray(dataArray)) return;

    if (this._isNotificationMode()) {
      // Notification mode is about "what is happening right now", so the
      // startup backlog is intentionally ignored unless explicitly enabled.
      if (!this.config.notifyOnInitialLoad) {
        this.loaded = true;
        this._refreshNotificationView();
        return;
      }
      dataArray
        .slice()
        .reverse() // oldest → newest so the newest ends up on top
        .forEach((item) => {
          if (item.code === 551) this._processQuakeData(item);
          else if (item.code === 552) this._processTsunamiData(item);
        });
      this.loaded = true;
      this._refreshNotificationView();
      return;
    }

    dataArray.forEach((item) => {
      if (item.code === 551) {
        this._addOrUpdateQuake(item);
      } else if (item.code === 552) {
        if (!item.cancelled) {
          this.tsunamiWarnings = [item];
        }
      } else if (item.code === 556) {
        // Skip old EEWs from REST
      }
    });
    this._pruneQuakes();
    this.loaded = true;
    this.updateDom(this.config.animationSpeed);
  },

  _addOrUpdateQuake(quake) {
    // Replace if same id
    const idx = this.quakes.findIndex((q) => q.id === quake.id);
    if (idx >= 0) {
      this.quakes[idx] = quake;
    } else {
      this.quakes.unshift(quake);
    }
    // Sort by earthquake time descending
    this.quakes.sort((a, b) => {
      const ta = a.earthquake ? a.earthquake.time : a.time;
      const tb = b.earthquake ? b.earthquake.time : b.time;
      return (tb || "").localeCompare(ta || "");
    });
  },

  _pruneQuakes() {
    const maxAge = this.config.maxAge;
    const now = Date.now();

    // Filter by age
    this.quakes = this.quakes.filter((q) => {
      if (!q.earthquake || !q.earthquake.time) return true;
      const t = this._parseP2PTime(q.earthquake.time);
      if (!t) return true;
      return (now - t.getTime()) < maxAge * 60 * 60 * 1000;
    });

    // Filter by minScale
    if (this.config.minScale > -1) {
      this.quakes = this.quakes.filter((q) => {
        if (!q.earthquake) return true;
        return q.earthquake.maxScale >= this.config.minScale;
      });
    }

    // Limit count
    this.quakes = this.quakes.slice(0, this.config.maxQuakes);
  },

  _parseP2PTime(timeStr) {
    if (!timeStr) return null;
    // "2019/08/26 20:53:00" → Date (JST)
    const replaced = timeStr.replace(/\//g, "-");
    // P2P times are JST (UTC+9)
    const d = new Date(replaced + "+09:00");
    return isNaN(d.getTime()) ? null : d;
  },
});
