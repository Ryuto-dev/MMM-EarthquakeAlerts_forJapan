#!/usr/bin/env node
/* MMM-EarthquakeMonitorJP — Preview server
 *
 * Serves a browser harness that loads the REAL module files
 * (MMM-EarthquakeMonitorJP.js / .css) on top of a small MagicMirror shim,
 * so the notification mode can be verified without a MagicMirror install.
 *
 * Also proxies the P2P Quake REST API so the preview can pull live data
 * without running into browser CORS restrictions.
 *
 * Usage:  node preview/server.js [--port 8080]
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");

// ─── Args ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { port: Number(process.env.PORT) || 8080, host: "0.0.0.0" };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === "--port" || argv[i] === "-p") && argv[i + 1]) {
      opts.port = parseInt(argv[++i], 10);
    } else if (argv[i] === "--host" && argv[i + 1]) {
      opts.host = argv[++i];
    }
  }
  return opts;
}

const options = parseArgs(process.argv);

// ─── Static file serving ───────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

// Only these paths may be served, to keep the surface tiny and safe.
const ALLOWED = new Set([
  "/MMM-EarthquakeMonitorJP.js",
  "/MMM-EarthquakeMonitorJP.css",
  "/preview/index.html",
  "/preview/harness.js",
  "/preview/harness.css",
  "/preview/fixtures.js",
  // Automated browser self-check
  "/preview/browser-check.html",
  "/preview/harness-shim-only.js",
]);

function serveFile(res, relPath) {
  const filePath = path.join(ROOT, relPath);

  // Defense-in-depth: never escape the project root
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found: " + relPath);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      // Always reload during development
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(data);
  });
}

// ─── P2P Quake REST proxy (avoids browser CORS) ────────────────────
async function proxyP2P(req, res, requestUrl) {
  const limit = Math.min(
    50,
    Math.max(1, parseInt(requestUrl.searchParams.get("limit") || "10", 10) || 10)
  );

  // Whitelist the codes we understand
  const allowedCodes = new Set(["551", "552", "556"]);
  let codes = requestUrl.searchParams.getAll("codes").filter((c) => allowedCodes.has(c));
  if (codes.length === 0) codes = ["551"];

  const sandbox = requestUrl.searchParams.get("sandbox") === "1";
  const base = sandbox
    ? "https://api-v2-sandbox.p2pquake.net/v2"
    : "https://api.p2pquake.net/v2";

  const target =
    base + "/history?limit=" + limit + "&" + codes.map((c) => "codes=" + c).join("&");

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "MMM-EarthquakeMonitorJP-Preview/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) throw new Error("upstream HTTP " + upstream.status);

    const body = await upstream.text();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(body);
    log("proxy → " + target + " (" + upstream.status + ")");
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "upstream fetch failed", message: error.message }));
    log("proxy FAILED → " + target + ": " + error.message);
  }
}

// ─── Logging ───────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  process.stdout.write("[" + ts + "] " + msg + "\n");
}

// ─── Server ────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let requestUrl;
  try {
    requestUrl = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  } catch (e) {
    res.writeHead(400).end("400 Bad Request");
    return;
  }

  const pathname = decodeURIComponent(requestUrl.pathname);

  // Silence favicon requests
  if (pathname === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }

  // Health check
  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }

  // Live data proxy
  if (pathname === "/api/p2pquake") {
    proxyP2P(req, res, requestUrl);
    return;
  }

  // Index
  if (pathname === "/" || pathname === "/index.html") {
    serveFile(res, "preview/index.html");
    return;
  }

  if (ALLOWED.has(pathname)) {
    serveFile(res, pathname.slice(1));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
});

server.listen(options.port, options.host, () => {
  log("MMM-EarthquakeMonitorJP preview server running");
  log("  → http://localhost:" + options.port + "/");
  log("  → serving module files from " + ROOT);
});

process.on("SIGTERM", () => {
  log("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
