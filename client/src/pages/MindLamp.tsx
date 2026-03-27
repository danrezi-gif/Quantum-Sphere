/**
 * MindLamp — Quantum Consciousness Visualizer
 *
 * Raymarched sphere driven by live quantum random numbers.
 * Based on Shadertoy t3ySzG — audio reactivity replaced with QRNG Z-score.
 *   bass (sphere size)  → |cumZ| — sphere breathes with cumulative deviation
 *   mids (color shift)  → trialZ — color modulates per trial
 */

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useQuantumStream } from "@/hooks/useQuantumStream";

// ─── Raymarched sphere shader ─────────────────────────────────────────────────

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec2  uResolution;
  uniform float uBass;    // |cumZ| mapped to ~0–1, drives sphere size
  uniform float uMids;    // trialZ mapped to ~0–1, drives color
  uniform float uInvert;  // 0.0 = dark mode, 1.0 = light mode

  void main() {
    vec2 f = gl_FragCoord.xy;

    float bass = uBass;
    float mids = uMids;
    float z = sin(uTime) + 1.5;

    float d;

    vec2 uv = (f - 0.5 * uResolution.xy) / uResolution.y * 10.0;

    vec4 o = vec4(0.0);

    for (int i = 0; i < 40; i++) {
      vec3 p = vec3(uv, z);

      float sphereSDF = length(p) - 2.9 * bass;

      d = 0.1 + 0.1 * abs(sphereSDF);

      z -= d;

      o += (sin(p.y + z + 3.0 * mids * vec4(0, 1, 2, 3)) + 1.0) / d;
    }

    o = tanh(o * o / 1e5);

    // Invert: white background, dark sphere
    o = mix(o, 1.0 - o, uInvert);

    gl_FragColor = o;
  }
`;

// ─── Fullscreen quad ──────────────────────────────────────────────────────────

function QuantumOrb({ bass, mids, absZ, inverted }: { bass: number; mids: number; absZ: number; inverted: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport, size } = useThree();
  const invertedRef = useRef(inverted);
  invertedRef.current = inverted;
  const bassRef = useRef(bass);
  bassRef.current = bass;
  const midsRef = useRef(mids);
  midsRef.current = mids;
  const absZRef = useRef(absZ);
  absZRef.current = absZ;

  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uBass:       { value: 0.3 },
    uMids:       { value: 0.5 },
    uInvert:     { value: 0 },
  }), []);

  useFrame(({ clock, size: frameSize }) => {
    const t = clock.getElapsedTime();
    const b = bassRef.current;
    const m = midsRef.current;
    const az = absZRef.current;
    const inv = invertedRef.current;
    uniforms.uTime.value = t;
    uniforms.uResolution.value.set(frameSize.width, frameSize.height);
    // Breath: gentle at rest, grows with Z — the breath IS the signal
    // Inverted mode uses smaller amplitude so sphere stays visible on white
    const breathAmp = inv ? (0.02 + az * 0.04) : (0.04 + az * 0.04);
    const breathSpeed = 0.4 + az * 0.15;
    const breath = breathAmp * Math.sin(t * breathSpeed);
    uniforms.uBass.value += (b + breath - uniforms.uBass.value) * 0.0016;
    uniforms.uMids.value += (m - uniforms.uMids.value) * 0.0016;
    uniforms.uInvert.value += ((inv ? 1 : 0) - uniforms.uInvert.value) * 0.04;
  });

  return (
    <mesh ref={meshRef} scale={[viewport.width + 1, viewport.height + 1, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function ZScoreMeter({ history, signalZ, mindlampMode, inverted }: { history: { cumZ: number }[]; signalZ: number; mindlampMode: boolean; inverted: boolean }) {
  const width = 280;
  const height = 60;
  const midY = height / 2;

  const points = history.slice(-120);
  const path = points.map((t, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = midY - (t.cumZ / 4) * (midY - 4);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");

  const sigLine = midY - (1.69 / 4) * (midY - 4);
  const sigLineNeg = midY + (1.69 / 4) * (midY - 4);

  const threshColor = inverted ? "rgba(180,160,40,0.35)" : "rgba(255,255,100,0.3)";
  const baseColor = inverted ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.15)";
  const traceColor = inverted ? "rgba(40,100,160,0.8)" : "rgba(150,220,255,0.9)";
  const textColor = inverted ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)";

  return (
    <div className="relative">
      <svg width={width} height={height} className="opacity-80">
        <line x1="0" y1={sigLine} x2={width} y2={sigLine}
          stroke={threshColor} strokeWidth="1" strokeDasharray="4,4" />
        <line x1="0" y1={sigLineNeg} x2={width} y2={sigLineNeg}
          stroke={threshColor} strokeWidth="1" strokeDasharray="4,4" />
        <line x1="0" y1={midY} x2={width} y2={midY}
          stroke={baseColor} strokeWidth="1" />
        {points.length > 1 && (
          <path d={path} fill="none" stroke={traceColor} strokeWidth="1.5" />
        )}
      </svg>
      <div className="absolute right-0 top-0 text-xs font-mono" style={{ color: textColor }}>
        {mindlampMode ? "Z" : "cumZ"} {signalZ > 0 ? "+" : ""}{signalZ.toFixed(3)}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MindLamp() {
  const {
    sessionActive, latest, history, visual, error,
    startSession, stopSession, resetSession,
  } = useQuantumStream();

  const [inverted, setInverted] = useState(false);
  const [mindlampMode, setMindlampMode] = useState(false);

  // MindLamp mode: instantaneous trialZ drives visuals (responsive, artistic)
  // Cumulative mode: cumZ builds over trials (PEAR protocol, scientific)
  const signalZ = mindlampMode ? (latest?.trialZ ?? 0) : (latest?.cumZ ?? 0);
  const absZ = Math.abs(signalZ);

  // Smooth sigmoid gate: ~0 below threshold, ~1 above — no hard switch
  const gate = 1 / (1 + Math.exp(-4 * (absZ - 1.69)));
  // Bass floor rises with Z above threshold; breath rides on top in useFrame
  const bass = 0.4 + gate * Math.min(absZ / 8, 0.4);
  // Color shift scales with Z — subtle at rest, clear above threshold
  const mids = 0.5 + signalZ * (0.02 + gate * 0.15);

  // Adaptive text colors based on mode
  const fg = inverted ? "rgba(0,0,0," : "rgba(255,255,255,";

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none" style={{ background: inverted ? "#fff" : "#000" }}>

      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false }}
        className="absolute inset-0"
      >
        <QuantumOrb bass={bass} mids={mids} absZ={absZ} inverted={inverted} />
      </Canvas>

      {/* Title */}
      <div className="absolute left-0 right-0 bottom-36 flex flex-col items-center pointer-events-none">
        <h1
          className="text-lg tracking-[0.35em] uppercase transition-colors duration-700"
          style={{
            fontFamily: "'Cinzel', serif",
            color: `${fg}0.4)`,
            letterSpacing: "0.35em",
          }}
        >
          Quantum Sphere
        </h1>
        <span
          className="text-[9px] tracking-[0.5em] uppercase mt-1 transition-colors duration-700"
          style={{
            fontFamily: "'Cinzel', serif",
            color: `${fg}0.25)`,
          }}
        >
          QRNG
        </span>
      </div>

      {/* Bottom HUD */}
      <div className="absolute bottom-0 left-0 right-0 px-6 py-6 flex items-end justify-between">

        {/* Left: stats */}
        <div className="flex flex-col gap-1 font-mono text-[10px]" style={{ color: `${fg}0.3)` }}>
          {latest && (
            <>
              <span>trial <span style={{ color: `${fg}0.5)` }}>{latest.trial}</span></span>
              <span>bitsum <span style={{ color: `${fg}0.5)` }}>{latest.bitSum}/200</span></span>
              <span>Z <span style={{ color: `${fg}0.5)` }}>{latest.trialZ > 0 ? "+" : ""}{latest.trialZ.toFixed(3)}</span></span>
            </>
          )}
          {error && <span className="text-red-400/60 text-[9px]">{error}</span>}
        </div>

        {/* Center: cumulative deviation plot + threshold */}
        <div className="flex flex-col items-center gap-2">
          {history.length > 0 && <ZScoreMeter history={history} signalZ={signalZ} mindlampMode={mindlampMode} inverted={inverted} />}
          {visual.thresholdCrossed && (
            <div
              className="px-4 py-1.5 rounded-full text-sm tracking-wide animate-pulse"
              style={{
                fontFamily: "'Cinzel', serif",
                background: inverted
                  ? `hsl(${visual.hue}, 40%, 90%)`
                  : `hsl(${visual.hue}, 70%, 12%)`,
                color: inverted
                  ? `hsl(${visual.hue}, 60%, 30%)`
                  : `hsl(${visual.hue}, 80%, 75%)`,
                border: `1px solid ${inverted
                  ? `hsl(${visual.hue}, 30%, 75%)`
                  : `hsl(${visual.hue}, 50%, 25%)`}`,
              }}
            >
              {visual.jackpot ? "resonance" : "threshold"}
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-end gap-3 pointer-events-auto">
          {/* MindLamp / Cumulative toggle */}
          <button
            onClick={() => setMindlampMode(!mindlampMode)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300"
            style={{
              background: mindlampMode
                ? (inverted ? "rgba(180,120,0,0.12)" : "rgba(255,200,80,0.12)")
                : (inverted ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"),
              border: `1px solid ${mindlampMode
                ? (inverted ? "rgba(180,120,0,0.3)" : "rgba(255,200,80,0.25)")
                : (inverted ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)")}`,
            }}
            title={mindlampMode ? "MindLamp mode (instant)" : "Cumulative mode (PEAR)"}
          >
            <svg width="11" height="14" viewBox="0 0 11 14" fill="none">
              <path d="M5.5 1C3.01 1 1 3.01 1 5.5c0 1.8 1.02 3.37 2.5 4.17V11h4V9.67C8.98 8.87 10 7.3 10 5.5 10 3.01 7.99 1 5.5 1Z"
                stroke={mindlampMode
                  ? (inverted ? "rgba(180,120,0,0.8)" : "rgba(255,200,80,0.8)")
                  : (inverted ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)")}
                strokeWidth="1.2" fill="none" />
              <line x1="3.5" y1="12" x2="7.5" y2="12"
                stroke={mindlampMode
                  ? (inverted ? "rgba(180,120,0,0.8)" : "rgba(255,200,80,0.8)")
                  : (inverted ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)")}
                strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>

          {/* Invert toggle */}
          <button
            onClick={() => setInverted(!inverted)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500"
            style={{
              background: inverted ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${inverted ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)"}`,
            }}
            title="Toggle light/dark"
          >
            <div
              className="w-3.5 h-3.5 rounded-full transition-all duration-500"
              style={{
                background: inverted
                  ? "linear-gradient(135deg, #222 50%, transparent 50%)"
                  : "linear-gradient(135deg, #eee 50%, transparent 50%)",
                border: `1px solid ${inverted ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)"}`,
              }}
            />
          </button>

          {/* Start / Stop */}
          {!sessionActive ? (
            <button
              onClick={startSession}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background: inverted ? "rgba(40,180,90,0.12)" : "rgba(100,255,150,0.1)",
                border: `1px solid ${inverted ? "rgba(40,180,90,0.3)" : "rgba(100,255,150,0.2)"}`,
              }}
              title="Start"
            >
              <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                <path d="M2 1L11 7L2 13V1Z" fill={inverted ? "rgba(40,180,90,0.8)" : "rgba(100,255,150,0.8)"} />
              </svg>
            </button>
          ) : (
            <button
              onClick={stopSession}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background: inverted ? "rgba(200,60,60,0.1)" : "rgba(255,100,100,0.1)",
                border: `1px solid ${inverted ? "rgba(200,60,60,0.25)" : "rgba(255,100,100,0.2)"}`,
              }}
              title="Stop"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect width="10" height="10" rx="1" fill={inverted ? "rgba(200,60,60,0.8)" : "rgba(255,100,100,0.8)"} />
              </svg>
            </button>
          )}

          {/* Reset */}
          <button
            onClick={resetSession}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300"
            style={{
              background: inverted ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${inverted ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
            }}
            title="Reset"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4 }}>
              <path d="M1 1L6 6M6 6L11 1M6 6L1 11M6 6L11 11" stroke={inverted ? "#000" : "#fff"} strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
