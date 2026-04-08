/**
 * Quantum Random Number stream — PEAR/MindLamp protocol
 *
 * Fetches 200 quantum random bytes from LfD QRNG (ID Quantique hardware),
 * extracts 1 bit (LSB) from each byte, computes per-trial and cumulative
 * Z-scores, then broadcasts each trial result to all connected SSE clients.
 *
 * One trial = 200 LSBs from 200 quantum random bytes.
 * Expected mean = 100, σ = √50 ≈ 7.071 (Binomial(200, 0.5))
 *
 * Real-time integrity: the next fetch begins only AFTER the current trial
 * has been emitted. No look-ahead buffering.
 */

import type { Request, Response } from "express";
import { appendFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "quantum-logs");
let logFile = "";

const BITS_PER_TRIAL = 200;
const EXPECTED_MEAN = 100;
const TRIAL_SD = Math.sqrt(50); // √50 ≈ 7.071

const LFD_URL = "https://lfdr.de/qrng_api/qrng";

export interface TrialResult {
  trial: number;
  bitSum: number;
  trialZ: number;
  cumZ: number;
  timestamp: number;
  rawBits: number[];
}

// --- Quantum fetch ---

async function fetchQuantumBits(): Promise<number[]> {
  const res = await fetch(`${LFD_URL}?length=${BITS_PER_TRIAL}&format=HEX`);
  const body = await res.text();
  if (!res.ok) throw new Error(`LfD QRNG ${res.status} — ${body.slice(0, 200)}`);
  const json = JSON.parse(body) as { qrn: string; length: number };
  if (!json.qrn) throw new Error(`LfD bad response: ${body.slice(0, 200)}`);
  const bytes: number[] = [];
  for (let i = 0; i < json.qrn.length && bytes.length < BITS_PER_TRIAL; i += 2) {
    bytes.push(parseInt(json.qrn.slice(i, i + 2), 16));
  }
  if (bytes.length < BITS_PER_TRIAL) {
    throw new Error(`LfD returned only ${bytes.length} bytes, need ${BITS_PER_TRIAL}`);
  }
  return bytes;
}

// --- Session state (shared across all SSE clients) ---

let sessionActive = false;
let sessionTimer: ReturnType<typeof setTimeout> | null = null;

let trialCount = 0;
let cumulativeBitSum = 0;

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
      await new Promise((r) => setTimeout(r, 800));
      if (!sessionActive) return;
    }
  }

  const bitSum = bits.reduce((acc, b) => acc + (b & 1), 0);
  trialCount++;
  cumulativeBitSum += bitSum;

  const trialZ = (bitSum - EXPECTED_MEAN) / TRIAL_SD;
  const cumZ = (cumulativeBitSum - trialCount * EXPECTED_MEAN) / (TRIAL_SD * Math.sqrt(trialCount));

  const result: TrialResult = {
    trial: trialCount,
    bitSum,
    trialZ: Math.round(trialZ * 1000) / 1000,
    cumZ: Math.round(cumZ * 1000) / 1000,
    timestamp: Date.now(),
    rawBits: bits,
  };

  if (logFile) {
    appendFileSync(logFile, `${result.trial},${result.bitSum},${result.trialZ},${result.cumZ},${result.timestamp}\n`);
  }

  broadcastTrial(result);

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

  res.write(`event: connected\ndata: ${JSON.stringify({
    sessionActive,
    trialCount,
    cumZ: trialCount > 0
      ? Math.round(((cumulativeBitSum - trialCount * EXPECTED_MEAN) / (TRIAL_SD * Math.sqrt(trialCount))) * 1000) / 1000
      : 0,
    timestamp: Date.now(),
  })}\n\n`);

  clients.add(res);

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
    // Auto-stop if no clients remain — prevents runaway sessions after all tabs close
    if (clients.size === 0 && sessionActive) {
      console.log("[quantum] last client disconnected — auto-stopping session");
      stopSession();
    }
  });
}
