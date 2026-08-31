/* MMM-EarthquakeMonitorJP — MagicMirror shim (no preview UI)
 *
 * Same Module / Log shim as harness.js but without the preview page
 * bootstrap, so automated checks (browser-check.html) can drive the module
 * directly. Exposes window.__shim.instantiate().
 */

(() => {
  "use strict";

  window.Log = {
    info: (...a) => console.info(...a),
    log: (...a) => console.log(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: () => {},
  };

  const registry = {};
  window.Module = {
    register(name, definition) { registry[name] = definition; },
    definitions: registry,
  };

  function instantiate(name, userConfig, mountEl) {
    const def = registry[name];
    if (!def) throw new Error("Module not registered: " + name);

    const instance = Object.create(def);
    instance.name = name;
    instance.identifier = "module_check_" + name;
    instance.config = Object.assign({}, def.defaults, userConfig || {});
    instance.hidden = false;
    instance.lockStrings = [];
    instance._mount = mountEl;

    instance.updateDom = function () {
      const dom = this.getDom();
      this._mount.innerHTML = "";
      this._mount.appendChild(dom);
    };

    instance.show = function (speed, options) {
      const lock = options && options.lockString;
      if (lock) {
        const i = this.lockStrings.indexOf(lock);
        if (i >= 0) this.lockStrings.splice(i, 1);
      }
      if (this.lockStrings.length > 0) return;
      this.hidden = false;
    };

    instance.hide = function (speed, options) {
      const lock = options && options.lockString;
      if (lock && this.lockStrings.indexOf(lock) < 0) this.lockStrings.push(lock);
      this.hidden = true;
    };

    instance.sendSocketNotification = function () {};

    // MagicMirror broadcasts to every module, including the sender, so
    // loop it back to exercise notificationReceived().
    instance.sendNotification = function (notification, payload) {
      if (typeof instance.notificationReceived === "function") {
        instance.notificationReceived(notification, payload, instance);
      }
    };
    instance.translate = (k) => k;
    instance.file = (f) => f;

    instance.start();
    instance.updateDom(0);
    return instance;
  }

  window.__shim = { instantiate, registry };
})();
