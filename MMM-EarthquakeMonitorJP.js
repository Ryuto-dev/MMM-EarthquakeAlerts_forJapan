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

    // Advanced
    wsEndpoint: "wss://api.p2pquake.net/v2/ws",
    restEndpoint: "https://api.p2pquake.net/v2",
  },

  // Required styles
  getStyles() {
    return ["MMM-EarthquakeMonitorJP.css"];
  },

  start() {
    Log.info("[MMM-EarthquakeMonitorJP] Starting module");
    this.quakes = [];
    this.eewAlerts = [];
    this.tsunamiWarnings = [];
    this.connectionStatus = "disconnected";
    this.loaded = false;

    // Send config to node_helper
    this.sendSocketNotification("CONFIG", this.config);
  },

  // ─── DOM Generation ──────────────────────────────────────────────
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "earthquake-monitor-jp";

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

    // Nothing to show
    if (wrapper.children.length === 0) {
      wrapper.style.display = "none";
    }

    return wrapper;
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
        this.updateDom(this.config.animationSpeed);
        break;
      case "INITIAL_DATA":
        this._processInitialData(payload);
        break;
    }
  },

  // ─── Process earthquake data ─────────────────────────────────────
  _processQuakeData(data) {
    if (!data || data.code !== 551) return;
    this._addOrUpdateQuake(data);
    this._pruneQuakes();
    this.loaded = true;
    this.updateDom(this.config.animationSpeed);
  },

  _processEEWData(data) {
    if (!data || data.code !== 556) return;

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
