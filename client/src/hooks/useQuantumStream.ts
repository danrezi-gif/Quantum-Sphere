/**
 * useQuantumStream — live SSE consumer for the MindLamp quantum engine
 *
 * Connects to /api/quantum/stream and maintains reactive state:
 *   - latest trial result
 *   - cumulative Z-score history (for the deviation plot)
 *   - session status
 *   - visual state derived from cumZ (color, intensity, threshold events)
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface TrialResult {
  trial: number;
  bitSum: number;
  trialZ: number;
  cumZ: number;
  timestamp: number;
  rawBits: number[];
}

export type IntentionMode = "HI" | "LO" | "BL";

export interface VisualState {
  /** 0–1, distance from baseline; drives bloom/intensity */
  intensity: number;
  /** 0–360 HSL hue: warm (0°) for +Z, cool (240°) for -Z, neutral (120°) at 0 */
  hue: number;
  /** true when |cumZ| ≥ 1.69 — Psyleron threshold (p ≈ 0.05) */
  thresholdCrossed: boolean;
  /** true when |cumZ| ≥ 3.3 — jackpot / white state (p < 0.001) */
  jackpot: boolean;
  /** +1 positive deviation, -1 negative, 0 neutral */
  direction: number;
}

export interface QuantumStreamState {
  connected: boolean;
  sessionActive: boolean;
  latest: TrialResult | null;
  history: TrialResult[];   // last 300 trials (5 min at 1/sec)
  visual: VisualState;
  intention: IntentionMode;
  error: string | null;
  setIntention: (mode: IntentionMode) => void;
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  resetSession: () => Promise<void>;
}

const MAX_HISTORY = 300;

// PEAR thresholds
const THRESHOLD_SIGNIFICANT = 1.69;  // p ≈ 0.05
const THRESHOLD_JACKPOT = 3.3;        // p < 0.001

function deriveVisual(cumZ: number): VisualState {
  const absZ = Math.abs(cumZ);
  const direction = cumZ > 0 ? 1 : cumZ < 0 ? -1 : 0;

  // Intensity: 0 at Z=0, 1 at |Z|=4
  const intensity = Math.min(absZ / 4, 1);

  // Hue: 120° (green/neutral) at Z=0
  //      0° (red) at cumZ = +4
  //      240° (blue) at cumZ = -4
  const hue = direction >= 0
    ? 120 - 120 * intensity          // green → red (warm)
    : 120 + 120 * intensity;         // green → blue/violet (cool)

  return {
    intensity,
    hue: Math.round(hue),
    thresholdCrossed: absZ >= THRESHOLD_SIGNIFICANT,
    jackpot: absZ >= THRESHOLD_JACKPOT,
    direction,
  };
}

export function useQuantumStream(): QuantumStreamState {
  const [connected, setConnected] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [latest, setLatest] = useState<TrialResult | null>(null);
  const [history, setHistory] = useState<TrialResult[]>([]);
  const [visual, setVisual] = useState<VisualState>(deriveVisual(0));
  const [intention, setIntention] = useState<IntentionMode>("BL");
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const sessionActiveRef = useRef(false);

  useEffect(() => {
    const es = new EventSource("/api/quantum/stream");
    esRef.current = es;

    es.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setConnected(true);
      const active = data.sessionActive ?? false;
      sessionActiveRef.current = active;
      setSessionActive(active);
      setVisual(deriveVisual(data.cumZ ?? 0));
    });

    es.addEventListener("session", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      const active = data.status === "started";
      sessionActiveRef.current = active;
      setSessionActive(active);
      if (data.status === "reset") {
        setHistory([]);
        setLatest(null);
        setVisual(deriveVisual(0));
      }
    });

    es.addEventListener("error", (e) => {
      if ((e as MessageEvent).data) {
        const data = JSON.parse((e as MessageEvent).data);
        setError(data.message ?? "Unknown error");
      }
    });

    // Default message event = trial result
    es.onmessage = (e) => {
      const trial: TrialResult = JSON.parse(e.data);
      setLatest(trial);
      setHistory((prev) => {
        const next = [...prev, trial];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
      setVisual(deriveVisual(trial.cumZ));
      setError(null);
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects; update state when it does
    };

    es.onopen = () => {
      setConnected(true);
    };

    const stopIfActive = () => {
      if (sessionActiveRef.current) {
        navigator.sendBeacon("/api/quantum/stop");
      }
    };

    window.addEventListener("beforeunload", stopIfActive);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") stopIfActive();
    });

    return () => {
      window.removeEventListener("beforeunload", stopIfActive);
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, []);

  const startSession = useCallback(async () => {
    await fetch("/api/quantum/start", { method: "POST" });
  }, []);

  const stopSession = useCallback(async () => {
    await fetch("/api/quantum/stop", { method: "POST" });
  }, []);

  const resetSession = useCallback(async () => {
    await fetch("/api/quantum/reset", { method: "POST" });
  }, []);

  return {
    connected,
    sessionActive,
    latest,
    history,
    visual,
    intention,
    error,
    setIntention,
    startSession,
    stopSession,
    resetSession,
  };
}
