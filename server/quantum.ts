/**
 * Quantum Random Number stream — PEAR/MindLamp protocol
 *
 * Fetches 200 quantum random bits from ANU QRNG exactly once per second,
 * computes per-trial and cumulative Z-scores, then broadcasts each trial
 * result to all connected SSE clients.
 *
 * One trial = 200 uint8 values, each contributing its LSB as a bit.
 * Expected mean = 100, σ = √50 ≈ 7.071 (Binomial(200, 0.5))
 *
 * This preserves real-time experimental integrity: the next fetch begins
 * only AFTER the current trial has been emitted to all clients.
 * No look-ahead buffering — intention and quantum event are simultaneous.
 */

import type { Request, Response } from "express";
import { appendFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "quantum-logs");
let logFile = "";

const BITS_PER_TRIAL = 200;
const EXPECTED_MEAN = 100;
const TRIAL_SD = Math.sqrt(50); // √50 ≈ 7.071

// Quantum RNG sources
const SOURCES = {
  anu_legacy: "https://qrng.anu.edu.au/API/jsonI.php",
  anu: "https://api.quantumnumbers.anu.edu.au",
  lfd: "https://lfdr.de/qrng_api/qrng",
} as const;

export type QRNGSource = keyof typeof SOURCES;

export interface TrialResult {
  trial: number;           // trial number since session start
  bitSum: number;          // sum of 200 bits (0–200)
  trialZ: number;          // per-trial Z-score
  cumZ: number;            // cumulative Z (primary signal)
  timestamp: number;       // unix ms
  source: string;          // which QRNG source was used
  rawBits: number[];       // the 200 uint8 values (LSBs used as bits)
}

// --- Quantum fetch — selects source from QRNG_SOURCE env var ---

async function fetchFromANU(): Promise<number[]> {
  const apiKey = process.env.ANU_API_KEY ?? "";
  const hasKey = apiKey && apiKey !== "your_api_key_here";
  const url = hasKey
    ? `${SOURCES.anu}?length=${BITS_PER_TRIAL}&type=uint8`
    : `${SOURCES.anu_legacy}?length=${BITS_PER_TRIAL}&type=uint8`;
  const headers: Record<string, string> = {};
  if (hasKey) headers["x-api-key"] = apiKey;

  const res = await fetch(url, { headers });
  const body = await res.text();
  if (!res.ok) throw new Error(`ANU ${res.status} — ${body.slice(0, 200)}`);
  const json = JSON.parse(body) as { success: boolean; data: number[] };
  if (!json.success || !Array.isArray(json.data) || json.data.length < BITS_PER_TRIAL) {
    throw new Error(`ANU bad response: ${body.slice(0, 200)}`);
  }
  return json.data.slice(0, BITS_PER_TRIAL);
}

async function fetchFromLfD(): Promise<number[]> {
  // LfD returns hex string; request 200 bytes = 200 uint8 values
  const res = await fetch(`${SOURCES.lfd}?length=${BITS_PER_TRIAL}&format=HEX`);
  const body = await res.text();
  if (!res.ok) throw new Error(`LfD ${res.status} — ${body.slice(0, 200)}`);
  const json = JSON.parse(body) as { qrn: string; length: number };
  if (!json.qrn) throw new Error(`LfD bad response: ${body.slice(0, 200)}`);
  // Convert hex string to array of uint8
  const bytes: number[] = [];
  for (let i = 0; i < json.qrn.length && bytes.length < BITS_PER_TRIAL; i += 2) {
    bytes.push(parseInt(json.qrn.slice(i, i + 2), 16));
  }
  if (bytes.length < BITS_PER_TRIAL) {
    throw new Error(`LfD returned only ${bytes.length} bytes, need ${BITS_PER_TRIAL}`);
  }
  return bytes;
}

function getSource(): QRNGSource {
  return (process.env.QRNG_SOURCE as QRNGSource) ?? "lfd";
}

async function fetchQuantumBits(): Promise<number[]> {
  const source = getSource();
  switch (source) {
    case "anu":
    case "anu_legacy":
      return fetchFromANU();
    case "lfd":
      return fetchFromLfD();
    default:
      return fetchFromLfD();
  }
}

// --- Session state (shared across all SSE clients) ---
// All viewers see the same quantum stream — this is intentional.
// The stream is driven by the server, not per-client.

let sessionActive = false;
let sessionTimer: ReturnType<typeof setTimeout> | null = null;

let trialCount = 0;
let cumulativeBitSum = 0; // running total of all bit sums

const clients = new Set<Response>();

function broadcastTrial(trial: TrialResult) {
  const data = `data: ${JSON.stringify(trial)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  });
}

function broadcastEvent(event: string, payload: object) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  });
}

async function runTrial() {
  if (!sessionActive) return;

  let bits: number[];
  let retries = 0;
  while (true) {
    try {
      bits = await fetchQuantumBits();
      break;
    } catch (err) {
      retries++;
      if (retries >= 5) {
        broadcastEvent("error", { message: String(err) });
        if (sessionActive) sessionTimer = setTimeout(runTrial, 3000);
        return;
      }
      // silent retry after 800ms for transient 500s
      await new Promise((r) => setTimeout(r, 800));
      if (!sessionActive) return;
    }
  }

  // Extract LSB from each uint8 as the random bit
  const bitSum = bits.reduce((acc, b) => acc + (b & 1), 0);
  trialCount++;
  cumulativeBitSum += bitSum;

  const trialZ = (bitSum - EXPECTED_MEAN) / TRIAL_SD;
  // Cumulative Z: (total_bits_sum - N*100) / (σ * √N)
  const cumZ = (cumulativeBitSum - trialCount * EXPECTED_MEAN) / (TRIAL_SD * Math.sqrt(trialCount));

  const result: TrialResult = {
    trial: trialCount,
    bitSum,
    trialZ: Math.round(trialZ * 1000) / 1000,
    cumZ: Math.round(cumZ * 1000) / 1000,
    timestamp: Date.now(),
    source: getSource(),
    rawBits: bits,
  };

  // Log to CSV
  if (logFile) {
    appendFileSync(logFile, `${result.trial},${result.bitSum},${result.trialZ},${result.cumZ},${result.timestamp}\n`);
  }

  broadcastTrial(result);

  // Schedule next trial — 1500ms gives comfortable margin over ANU's 1 req/sec rate limit
  // (fetch itself takes ~200-400ms, so 1000ms timeout would send requests ~600ms apart)
  if (sessionActive) {
    sessionTimer = setTimeout(runTrial, 1500);
  }
}

// --- Session control ---

export function startSession() {
  if (sessionActive) return;
  sessionActive = true;
  trialCount = 0;
  cumulativeBitSum = 0;

  // Create session log file
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  logFile = join(LOG_DIR, `session-${ts}.csv`);
  writeFileSync(logFile, "trial,bitSum,trialZ,cumZ,timestamp\n");
  console.log(`[quantum] session log: ${logFile}`);

  broadcastEvent("session", { status: "started", timestamp: Date.now() });
  runTrial();
}

export function stopSession() {
  sessionActive = false;
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
  broadcastEvent("session", { status: "stopped", timestamp: Date.now() });
}

export function resetSession() {
  stopSession();
  trialCount = 0;
  cumulativeBitSum = 0;
  broadcastEvent("session", { status: "reset", timestamp: Date.now() });
}

// --- SSE route handler ---

export function handleSSE(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Send current state immediately on connect
  res.write(`event: connected\ndata: ${JSON.stringify({
    sessionActive,
    trialCount,
    cumZ: trialCount > 0
      ? Math.round(((cumulativeBitSum - trialCount * EXPECTED_MEAN) / (TRIAL_SD * Math.sqrt(trialCount))) * 1000) / 1000
      : 0,
    timestamp: Date.now(),
  })}\n\n`);

  clients.add(res);

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}