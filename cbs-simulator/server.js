#!/usr/bin/env node
/**
 * CBS Simulator — Mini serveur autonome
 *
 * - Sert l'interface statique sur http://localhost:3100
 * - Reçoit les webhooks de la plateforme LabFT sur /webhook/cbs
 * - Stocke les webhooks dans /webhooks-log/ pour relecture
 * - Endpoint /api/webhooks/recent pour le live feed UI
 *
 * Aucune dépendance externe — Node natif uniquement.
 * Usage : node cbs-simulator/server.js
 */

import http from "node:http";
import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.SIMULATOR_PORT || 3100;
const LOG_DIR   = path.join(__dirname, "webhooks-log");
const RECENT    = []; // Buffer mémoire (50 derniers)

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
};

const server = http.createServer(async (req, res) => {
  // CORS pour développement
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-KYC-Api-Key, X-CBS-Api-Key");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // ─── Webhook receiver (POST depuis LabFT) ────────────────────────────────
  if (req.method === "POST" && url.pathname === "/webhook/cbs") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      let json;
      try { json = JSON.parse(body); }
      catch { json = { raw: body }; }

      const entry = {
        receivedAt: new Date().toISOString(),
        headers: {
          "x-kyc-api-key": req.headers["x-kyc-api-key"]?.slice(0,8) + "…",
          "x-kyc-source":  req.headers["x-kyc-source"],
        },
        payload: json,
      };

      RECENT.unshift(entry);
      if (RECENT.length > 50) RECENT.pop();

      // Persister sur disque pour archives
      const filename = `${entry.receivedAt.replace(/[:.]/g, "-")}.json`;
      fs.writeFileSync(path.join(LOG_DIR, filename), JSON.stringify(entry, null, 2));

      console.log(`[WEBHOOK] ${json.event ?? "?"} — customer ${json.customerRef ?? "?"} — ${json.reason ?? ""}`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ack: true, receivedAt: entry.receivedAt }));
    });
    return;
  }

  // ─── API : derniers webhooks (live feed UI) ──────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/webhooks/recent") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(RECENT));
    return;
  }

  // ─── API : effacer le buffer ────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/webhooks/clear") {
    RECENT.length = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ cleared: true }));
    return;
  }

  // ─── Servir les fichiers statiques ───────────────────────────────────────
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = path.join(__dirname, filePath);

  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(fullPath).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 — fichier introuvable : " + filePath);
});

server.listen(PORT, () => {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  🎯 CBS SIMULATOR démarré                                   ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Interface  : http://localhost:${PORT}                        ║`);
  console.log(`║  Webhook    : http://localhost:${PORT}/webhook/cbs            ║`);
  console.log(`║  Logs       : cbs-simulator/webhooks-log/                  ║`);
  console.log("║                                                              ║");
  console.log("║  À configurer dans LabFT (.env) :                           ║");
  console.log(`║    CBS_WEBHOOK_URL=http://localhost:${PORT}/webhook/cbs       ║`);
  console.log("║    CBS_NOTIFY_ENABLED=true                                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
});
