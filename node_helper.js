/* MagicMirror²
 * Node Helper: MMM-EarthquakeMonitorJP
 *
 * Connects to P2P Quake WebSocket API for real-time earthquake data.
 * Uses reconnecting-websocket for robust connection management.
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const ReconnectingWebSocket = require("reconnecting-websocket");
const WebSocket = require("ws");

module.exports = NodeHelper.create({
  // ─── Lifecycle ───────────────────────────────────────────────────

  start() {
    Log.log("[MMM-EarthquakeMonitorJP] Node helper started");
    this.config = null;
    this.ws = null;
    this.restTimer = null;
    this.seenIds = new Set();
    this.initialFetchDone = false;
  },

  stop() {
    Log.log("[MMM-EarthquakeMonitorJP] Node helper stopping");
    this._closeWebSocket();
    if (this.restTimer) {
      clearInterval(this.restTimer);
      this.restTimer = null;
    }
  },

  // ─── Socket Notifications from Module ────────────────────────────

  socketNotificationReceived(notification, payload) {
    if (notification === "CONFIG") {
      this.config = payload;
      this._initialize();
    }
  },

  // ─── Initialization ──────────────────────────────────────────────

  _initialize() {
    // Fetch initial data via REST API
    if (this.config.useRESTFallback) {
      this._fetchRESTData();
    }

    // Connect WebSocket
    if (this.config.useWebSocket) {
      this._connectWebSocket();
    }

    // Schedule periodic REST polling as fallback
    if (this.config.useRESTFallback && this.config.restUpdateInterval > 0) {
      if (this.restTimer) clearInterval(this.restTimer);
      this.restTimer = setInterval(() => {
        this._fetchRESTData();
      }, this.config.restUpdateInterval * 1000);
    }
  },

  // ─── WebSocket Connection ────────────────────────────────────────

  _connectWebSocket() {
    const endpoint = this.config.wsEndpoint || "wss://api.p2pquake.net/v2/ws";

    Log.info("[MMM-EarthquakeMonitorJP] Connecting WebSocket to: " + endpoint);

    this._closeWebSocket();

    // Use reconnecting-websocket with ws as the WebSocket implementation
    this.ws = new ReconnectingWebSocket(endpoint, [], {
      WebSocket: WebSocket,
      connectionTimeout: 10000,
      maxRetries: Infinity,
      maxReconnectionDelay: 60000,
      minReconnectionDelay: 1000 + Math.random() * 3000,
      reconnectionDelayGrowFactor: 1.5,
    });

    this.ws.addEventListener("open", () => {
      Log.info("[MMM-EarthquakeMonitorJP] WebSocket connected");
      this.sendSocketNotification("CONNECTION_STATUS", {
        status: "connected",
      });
    });

    this.ws.addEventListener("message", (event) => {
      this._handleWSMessage(event.data);
    });

    this.ws.addEventListener("close", (event) => {
      Log.warn(
        "[MMM-EarthquakeMonitorJP] WebSocket closed: code=" +
          event.code +
          " reason=" +
          event.reason
      );
      this.sendSocketNotification("CONNECTION_STATUS", {
        status: "reconnecting",
      });
    });

    this.ws.addEventListener("error", (event) => {
      Log.error(
        "[MMM-EarthquakeMonitorJP] WebSocket error: " +
          (event.message || "unknown error")
      );
    });
  },

  _closeWebSocket() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
  },

  // ─── Handle WebSocket Messages ───────────────────────────────────

  _handleWSMessage(rawData) {
    let data;
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      Log.error("[MMM-EarthquakeMonitorJP] Failed to parse WS message: " + e);
      return;
    }

    // Deduplicate by id
    if (data.id) {
      if (this.seenIds.has(data.id)) {
        return;
      }
      this.seenIds.add(data.id);
      this._pruneSeenIds();
    }

    this._dispatchData(data);
  },

  // Prevent memory leak by capping seen IDs
  _pruneSeenIds() {
    if (this.seenIds.size > 1000) {
      const arr = Array.from(this.seenIds);
      this.seenIds = new Set(arr.slice(arr.length - 500));
    }
  },

  // ─── REST API Fetch ──────────────────────────────────────────────

  async _fetchRESTData() {
    const baseUrl = this.config.restEndpoint || "https://api.p2pquake.net/v2";

    try {
      // Fetch earthquake info (code 551), tsunami (552), EEW (556)
      const codes = [];
      if (this.config.showQuakeInfo) codes.push(551);
      if (this.config.showTsunami) codes.push(552);
      if (this.config.showEEW) codes.push(556);

      const codesParam = codes.map((c) => "codes=" + c).join("&");
      const url =
        baseUrl + "/history?limit=20&" + codesParam;

      Log.debug("[MMM-EarthquakeMonitorJP] REST fetch: " + url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const items = await response.json();
      if (!Array.isArray(items)) {
        Log.warn("[MMM-EarthquakeMonitorJP] REST response is not an array");
        return;
      }

      if (!this.initialFetchDone) {
        // First fetch: hand over the whole backlog so list mode can populate.
        // Notification mode decides on its own whether to alert for it.
        items.forEach((item) => {
          if (item.id) this.seenIds.add(item.id);
        });
        this.initialFetchDone = true;
        this.sendSocketNotification("INITIAL_DATA", items);
      } else {
        // Subsequent polls: only forward genuinely new events, oldest first,
        // as individual realtime events. This keeps notification mode from
        // re-alerting for the same earthquake on every poll.
        const fresh = items.filter((item) => !item.id || !this.seenIds.has(item.id));
        fresh.reverse();
        fresh.forEach((item) => {
          if (item.id) this.seenIds.add(item.id);
          Log.info(
            "[MMM-EarthquakeMonitorJP] New event via REST poll (code " + item.code + ")"
          );
          this._dispatchData(item);
        });
        this._pruneSeenIds();
      }

      this.sendSocketNotification("CONNECTION_STATUS", {
        status: "connected",
      });
    } catch (error) {
      Log.error(
        "[MMM-EarthquakeMonitorJP] REST fetch failed: " + error.message
      );
    }
  },

  // ─── Dispatch Data by Code ───────────────────────────────────────

  _dispatchData(data) {
    switch (data.code) {
      case 551:
        // Earthquake information
        Log.info(
          "[MMM-EarthquakeMonitorJP] Earthquake: " +
            (data.earthquake && data.earthquake.hypocenter
              ? data.earthquake.hypocenter.name
              : "unknown")
        );
        this.sendSocketNotification("QUAKE_DATA", data);
        break;

      case 552:
        // Tsunami warning
        Log.info("[MMM-EarthquakeMonitorJP] Tsunami warning received");
        this.sendSocketNotification("TSUNAMI_DATA", data);
        break;

      case 556:
        // Early Earthquake Warning (EEW)
        Log.info("[MMM-EarthquakeMonitorJP] EEW alert received");
        this.sendSocketNotification("EEW_DATA", data);
        break;

      case 554:
        // EEW detection (chime)
        Log.info("[MMM-EarthquakeMonitorJP] EEW detection received");
        // We could trigger a sound here, but for now just log it
        break;

      case 555:
        // Area peers - not displayed
        break;

      case 561:
        // User-reported quake - not displayed by default
        break;

      case 9611:
        // Userquake evaluation - not displayed by default
        break;

      default:
        Log.debug(
          "[MMM-EarthquakeMonitorJP] Unknown code: " + data.code
        );
    }
  },
});
