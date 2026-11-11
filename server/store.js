"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.VERCEL ? "/tmp/peddigital-print" : path.join(__dirname, "..", "data"));
const FILE = path.join(DATA_DIR, "state.json");


function empty() {
  return {
    agents: {}, // token -> { lastSeen, kitchenIp, barIp, name }
    jobs: [], // { id, agentToken, status, createdAt, order, tickets }
    rate: {}, // key -> { count, resetAt }
  };
}

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) return empty();
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return empty();
  }
}

function save(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state));
  } catch (err) {
    // /tmp may work on some hosts; ignore persist failures in memory-only mode
    console.warn("persist failed", err.message);
  }
}

let state = load();

function mutate(fn) {
  const out = fn(state);
  save(state);
  return out;
}

module.exports = { state, mutate, save, load };
