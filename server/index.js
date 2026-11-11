"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const { nanoid } = require("nanoid");
const { state, mutate } = require("./store");

const PORT = Number(process.env.PORT) || 8790;
const AGENT_TOKEN = process.env.AGENT_TOKEN || "b230c36fe19f28a4bfcc76ee68c5d64b";
const PUBLIC_SLUG = process.env.PUBLIC_SLUG || "demo";
const AGENT_ONLINE_MS = 45_000;
const MAX_ITEMS = 20;
const MAX_ORDERS_PER_MESA_HOUR = 12;
const MAX_ORDERS_PER_IP_MIN = 6;

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .toString()
    .split(",")[0]
    .trim();
}

function hitRate(key, limit, windowMs) {
  const now = Date.now();
  return mutate((s) => {
    const cur = s.rate[key];
    if (!cur || cur.resetAt < now) {
      s.rate[key] = { count: 1, resetAt: now + windowMs };
      return { ok: true, remaining: limit - 1 };
    }
    if (cur.count >= limit) return { ok: false, remaining: 0 };
    cur.count += 1;
    return { ok: true, remaining: limit - cur.count };
  });
}

function agentOnline() {
  const a = state.agents[AGENT_TOKEN];
  return !!(a && Date.now() - a.lastSeen < AGENT_ONLINE_MS);
}

app.get("/api/health", (_req, res) => {
  const a = state.agents[AGENT_TOKEN];
  res.json({
    ok: true,
    publicSlug: PUBLIC_SLUG,
    agentOnline: agentOnline(),
    lastSeen: a?.lastSeen || null,
    pendingJobs: state.jobs.filter((j) => j.agentToken === AGENT_TOKEN && j.status === "pending").length,
  });
});

/** Android heartbeat + pull jobs */
app.post("/api/agent/heartbeat", (req, res) => {
  const token = req.headers["x-agent-token"] || req.body?.token;
  if (token !== AGENT_TOKEN) return res.status(401).json({ ok: false, error: "token inválido" });

  mutate((s) => {
    s.agents[token] = {
      lastSeen: Date.now(),
      kitchenIp: req.body?.kitchenIp || s.agents[token]?.kitchenIp || "192.168.1.26",
      barIp: req.body?.barIp || s.agents[token]?.barIp || "192.168.1.26",
      name: req.body?.name || "android",
    };
  });

  const jobs = state.jobs.filter((j) => j.agentToken === token && j.status === "pending").slice(0, 10);
  res.json({ ok: true, jobs });
});

app.post("/api/agent/ack", (req, res) => {
  const token = req.headers["x-agent-token"] || req.body?.token;
  if (token !== AGENT_TOKEN) return res.status(401).json({ ok: false, error: "token inválido" });
  const { jobId, ok = true, error = "" } = req.body || {};
  mutate((s) => {
    const job = s.jobs.find((j) => j.id === jobId && j.agentToken === token);
    if (!job) return;
    job.status = ok ? "printed" : "failed";
    job.error = error;
    job.finishedAt = Date.now();
  });
  res.json({ ok: true });
});

/** Customer creates order from any network (4G/5G/Wi‑Fi) */
app.post("/api/orders", (req, res) => {
  const ip = clientIp(req);
  const {
    slug = PUBLIC_SLUG,
    mesa = "",
    comanda = "",
    note = "",
    tickets = [],
  } = req.body || {};

  if (slug !== PUBLIC_SLUG) {
    return res.status(404).json({ ok: false, error: "estabelecimento não encontrado" });
  }
  if (!agentOnline()) {
    return res.status(503).json({
      ok: false,
      error: "Estabelecimento offline no momento. Tente de novo em instantes.",
    });
  }
  if (!Array.isArray(tickets) || tickets.length === 0) {
    return res.status(400).json({ ok: false, error: "pedido vazio" });
  }

  const itemCount = tickets.reduce(
    (n, t) => n + (t.items || []).reduce((m, i) => m + (Number(i.qty) || 1), 0),
    0
  );
  if (itemCount > MAX_ITEMS) {
    return res.status(400).json({ ok: false, error: `Máximo de ${MAX_ITEMS} itens por pedido` });
  }

  const ipRate = hitRate(`ip:${ip}`, MAX_ORDERS_PER_IP_MIN, 60_000);
  if (!ipRate.ok) {
    return res.status(429).json({ ok: false, error: "Muitos pedidos deste dispositivo. Aguarde 1 minuto." });
  }
  const mesaKey = String(mesa || "s/n").slice(0, 32);
  const mesaRate = hitRate(`mesa:${mesaKey}`, MAX_ORDERS_PER_MESA_HOUR, 3600_000);
  if (!mesaRate.ok) {
    return res.status(429).json({ ok: false, error: "Limite de pedidos desta mesa nesta hora." });
  }

  const job = {
    id: nanoid(12),
    agentToken: AGENT_TOKEN,
    status: "pending",
    createdAt: Date.now(),
    fromIp: ip,
    order: {
      mesa: mesaKey,
      comanda: String(comanda || "T").slice(0, 32),
      note: String(note || "").slice(0, 200),
    },
    tickets: tickets.slice(0, 5).map((t) => ({
      station: String(t.station || "COZINHA").toUpperCase() === "BAR" ? "BAR" : "COZINHA",
      items: (t.items || []).slice(0, MAX_ITEMS).map((i) => ({
        qty: Math.min(99, Math.max(1, Number(i.qty) || 1)),
        name: String(i.name || "Item").slice(0, 80),
        note: String(i.note || "").slice(0, 80),
      })),
    })),
  };

  mutate((s) => {
    s.jobs.push(job);
    // keep last 200
    if (s.jobs.length > 200) s.jobs = s.jobs.slice(-200);
  });

  res.json({ ok: true, jobId: job.id, message: "Pedido enviado à cozinha/bar" });
});

app.get(["/m/:slug", "/"], (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PedDigital Print Cloud :${PORT}`);
    console.log(`  Cardápio público: /m/${PUBLIC_SLUG}?mesa=12`);
    console.log(`  AGENT_TOKEN: ${AGENT_TOKEN}`);
  });
}

module.exports = app;
