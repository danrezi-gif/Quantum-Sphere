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
  const { viewport, size, gl } = useThree();
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

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const b = bassRef.current;
    const m = midsRef.current;
    const az = absZRef.current;
    const inv = invertedRef.current;
    uniforms.uTime.value = t;
    uniforms.uResolution.value.set(gl.domElement.width, gl.domElement.height);
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
  const width = Math.min(280, window.innerWidth - 48);
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
  const [infoOpen, setInfoOpen] = useState(false);

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
    <div className="relative w-full select-none flex flex-col overflow-hidden" style={{ height: '100dvh', background: inverted ? "#fff" : "#000" }}>

      {/* Sphere — fills available space, capped so UI strip doesn't get pushed too low */}
      <div className="relative flex-1 min-h-0" style={{ maxHeight: 'clamp(55dvh, 75dvh, 80dvh)' }}>
        <Canvas
          camera={{ position: [0, 0, 5], fov: 60 }}
          dpr={[1, 2]}
          gl={{ antialias: false, alpha: true }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <QuantumOrb bass={bass} mids={mids} absZ={absZ} inverted={inverted} />
        </Canvas>
      </div>

      {/* Lower UI strip — floats above the bottom edge */}
      <div style={{ marginBottom: 'clamp(16px, 3vh, 48px)' }}>

      {/* Title */}
      <div className="flex flex-col items-center pointer-events-none" style={{ marginTop: '-3rem', paddingTop: 'clamp(8px, 1vh, 16px)', paddingBottom: 'clamp(4px, 0.5vh, 8px)' }}>
        <h1
          className="tracking-[0.35em] uppercase transition-colors duration-700"
          style={{ fontFamily: "'Cinzel', serif", color: `${fg}0.4)`, letterSpacing: "0.35em", fontSize: 'clamp(15px, 2.2vw, 26px)' }}
        >
          Quantum Sphere
        </h1>
        <span
          className="tracking-[0.5em] uppercase mt-1 transition-colors duration-700"
          style={{ fontFamily: "'Cinzel', serif", color: `${fg}0.25)`, fontSize: 'clamp(8px, 1vw, 13px)' }}
        >
          QRNG
        </span>
      </div>

      {/* Stats */}
      <div className="flex flex-row justify-center font-mono" style={{ color: `${fg}0.3)`, paddingTop: 'clamp(12px, 1.5vh, 24px)', paddingBottom: 8, gap: 'clamp(12px, 2.5vw, 28px)', fontSize: 'clamp(10px, 1.4vw, 15px)' }}>
        {latest && (
          <>
            <span>trial <span style={{ color: `${fg}0.5)` }}>{latest.trial}</span></span>
            <span>bitsum <span style={{ color: `${fg}0.5)` }}>{latest.bitSum}/200</span></span>
            <span>Z <span style={{ color: `${fg}0.5)` }}>{latest.trialZ > 0 ? "+" : ""}{latest.trialZ.toFixed(3)}</span></span>
          </>
        )}
        {error && <span className="text-red-400/60 text-[9px]">{error}</span>}
      </div>

      {/* ZScore meter */}
      {history.length > 0 && (
        <div className="flex flex-col items-center pb-2">
          <ZScoreMeter history={history} signalZ={signalZ} mindlampMode={mindlampMode} inverted={inverted} />
          {visual.thresholdCrossed && (
            <div
              className="px-4 py-1.5 rounded-full text-sm tracking-wide animate-pulse mt-2"
              style={{
                fontFamily: "'Cinzel', serif",
                background: inverted ? `hsl(${visual.hue}, 40%, 90%)` : `hsl(${visual.hue}, 70%, 12%)`,
                color: inverted ? `hsl(${visual.hue}, 60%, 30%)` : `hsl(${visual.hue}, 80%, 75%)`,
                border: `1px solid ${inverted ? `hsl(${visual.hue}, 30%, 75%)` : `hsl(${visual.hue}, 50%, 25%)`}`,
              }}
            >
              {visual.jackpot ? "resonance" : "threshold"}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div
        className="flex items-center justify-center pointer-events-auto"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', paddingTop: 'clamp(16px, 2.5vh, 32px)', gap: 'clamp(10px, 2vw, 20px)' }}
      >
        {(() => {
          const btnSize = 'clamp(36px, 5vw, 52px)';
          const btnStyle = (active: boolean, activeColor: string, borderColor: string) => ({
            width: btnSize, height: btnSize, minWidth: btnSize,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s',
            background: active ? activeColor : (inverted ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"),
            border: `1px solid ${active ? borderColor : (inverted ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)")}`,
            cursor: 'pointer',
          });
          const svgScale = 'clamp(11px, 1.5vw, 16px)';
          return (<>
            {/* Info */}
            <button onClick={() => setInfoOpen(!infoOpen)} style={btnStyle(infoOpen, inverted ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)", inverted ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)")} title="About this experiment">
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(14px, 1.8vw, 20px)', fontStyle: "italic", color: inverted ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)" }}>i</span>
            </button>

            {/* MindLamp / Cumulative toggle */}
            <button onClick={() => setMindlampMode(!mindlampMode)} style={btnStyle(mindlampMode, inverted ? "rgba(180,120,0,0.12)" : "rgba(255,200,80,0.12)", inverted ? "rgba(180,120,0,0.3)" : "rgba(255,200,80,0.25)")} title={mindlampMode ? "MindLamp mode (instant)" : "Cumulative mode (PEAR)"}>
              <svg width={svgScale} height={svgScale} viewBox="0 0 11 14" fill="none" style={{ width: svgScale, height: svgScale }}>
                <path d="M5.5 1C3.01 1 1 3.01 1 5.5c0 1.8 1.02 3.37 2.5 4.17V11h4V9.67C8.98 8.87 10 7.3 10 5.5 10 3.01 7.99 1 5.5 1Z" stroke={mindlampMode ? (inverted ? "rgba(180,120,0,0.8)" : "rgba(255,200,80,0.8)") : (inverted ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)")} strokeWidth="1.2" fill="none" />
                <line x1="3.5" y1="12" x2="7.5" y2="12" stroke={mindlampMode ? (inverted ? "rgba(180,120,0,0.8)" : "rgba(255,200,80,0.8)") : (inverted ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)")} strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>

            {/* Invert toggle */}
            <button onClick={() => setInverted(!inverted)} style={{ ...btnStyle(false, '', ''), background: inverted ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)", border: `1px solid ${inverted ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)"}` }} title="Toggle light/dark">
              <div style={{ width: 'clamp(12px, 1.6vw, 18px)', height: 'clamp(12px, 1.6vw, 18px)', borderRadius: '50%', background: inverted ? "linear-gradient(135deg, #222 50%, transparent 50%)" : "linear-gradient(135deg, #eee 50%, transparent 50%)", border: `1px solid ${inverted ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)"}`, transition: 'all 0.5s' }} />
            </button>

            {/* Start / Stop */}
            {!sessionActive ? (
              <button onClick={startSession} style={btnStyle(false, '', '')} title="Start" >
                <svg viewBox="0 0 12 14" fill="none" style={{ width: svgScale, height: svgScale }}>
                  <path d="M2 1L11 7L2 13V1Z" fill={inverted ? "rgba(40,180,90,0.8)" : "rgba(100,255,150,0.8)"} />
                </svg>
              </button>
            ) : (
              <button onClick={stopSession} style={{ ...btnStyle(false, '', ''), background: inverted ? "rgba(200,60,60,0.1)" : "rgba(255,100,100,0.1)", border: `1px solid ${inverted ? "rgba(200,60,60,0.25)" : "rgba(255,100,100,0.2)"}` }} title="Stop">
                <svg viewBox="0 0 10 10" fill="none" style={{ width: svgScale, height: svgScale }}>
                  <rect width="10" height="10" rx="1" fill={inverted ? "rgba(200,60,60,0.8)" : "rgba(255,100,100,0.8)"} />
                </svg>
              </button>
            )}

            {/* Reset */}
            <button onClick={resetSession} style={btnStyle(false, '', '')} title="Reset">
              <svg viewBox="0 0 12 12" fill="none" style={{ width: svgScale, height: svgScale, opacity: 0.4 }}>
                <path d="M1 1L6 6M6 6L11 1M6 6L1 11M6 6L11 11" stroke={inverted ? "#000" : "#fff"} strokeWidth="1.5" />
              </svg>
            </button>

            {/* Ko-fi */}
            <a href="https://ko-fi.com/monkadelic" target="_blank" rel="noopener noreferrer"
              style={{ ...btnStyle(false, '', ''), textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Support on Ko-fi"
            >
              <span style={{ fontSize: 'clamp(14px, 1.8vw, 20px)', lineHeight: 1 }}>☕</span>
            </a>
          </>);
        })()}
      </div>

      </div>{/* end lower UI strip */}

      {/* Info overlay — fullscreen, above everything */}
      {infoOpen && (
        <div
          className="absolute z-50"
          style={{
            top: 0, right: 0, bottom: 0, left: 0,
            background: inverted ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.88)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            overflowY: "auto",
            padding: 'clamp(60px, 9vh, 100px) clamp(24px, 5vw, 64px)',
          }}
          onClick={() => setInfoOpen(false)}
        >
          <div
            style={{
              maxWidth: 'clamp(320px, 70vw, 680px)',
              width: '100%',
              color: inverted ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)",
              fontFamily: "'Cormorant Garamond', serif",
              lineHeight: 1.8,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(20px, 3vh, 36px)' }}>
              <h2
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 'clamp(15px, 2vw, 24px)',
                  letterSpacing: "0.25em",
                  textTransform: "uppercase",
                  color: inverted ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)",
                }}
              >
                About this experiment
              </h2>
              <button
                onClick={() => setInfoOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'clamp(22px, 2.5vw, 32px)',
                  lineHeight: 1,
                  color: inverted ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)",
                  padding: '4px 8px',
                }}
              >×</button>
            </div>

            <p style={{ fontSize: 'clamp(15px, 1.8vw, 22px)', marginBottom: 'clamp(16px, 2.5vh, 28px)' }}>
              The sphere's form and color are driven by a live stream of true random numbers sourced
              from photon detection hardware. When cumulative deviations cross a statistical threshold,
              the sphere swells and its palette shifts. The experiment asks whether focused intention
              can nudge quantum randomness beyond what chance alone predicts.
            </p>

            <p style={{ fontSize: 'clamp(13px, 1.5vw, 19px)', marginBottom: 'clamp(20px, 3vh, 40px)', fontStyle: "italic", opacity: 0.7 }}>
              This project draws from the PEAR Lab tradition — decades of research at Princeton
              exploring the interaction between consciousness and physical systems.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 'clamp(6px, 1vh, 12px)' }}>
              <h3 style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 'clamp(11px, 1.2vw, 15px)',
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.45,
                marginBottom: 8,
              }}>Controls</h3>
              {[
                ["ⓘ", "This screen."],
                ["💡", "Toggle mode — Cumulative tracks deviation across the full session (PEAR protocol). MindLamp responds to each trial instantly, making the sphere more reactive."],
                ["◐", "Switch between dark and light mode."],
                ["▶", "Start or stop a session. Streams live quantum data and computes Z-scores trial by trial."],
                ["✕", "Reset the session and clear all accumulated data."],
              ].map(([icon, desc]) => (
                <div key={icon} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', fontSize: 'clamp(13px, 1.5vw, 17px)', padding: '4px 0' }}>
                  <span style={{ opacity: 0.45, minWidth: '1.8em', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                  <span style={{ opacity: 0.75, lineHeight: 1.6 }}>{desc}</span>
                </div>
              ))}
              <p style={{ fontSize: 'clamp(12px, 1.3vw, 16px)', opacity: 0.45, marginTop: 4 }}>
                The stats below the title show: <em>trial</em> (count), <em>bitsum</em> (raw bits out of 200), <em>Z</em> (trial Z-score), and <em>cumZ</em> (cumulative Z-score — the main signal).
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 'clamp(10px, 1.5vh, 18px)', marginTop: 'clamp(24px, 4vh, 44px)' }}>
              <h3 style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 'clamp(11px, 1.2vw, 15px)',
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.45,
                marginBottom: 2,
              }}>
                Research
              </h3>
              <a href="https://icrl.org/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 'clamp(13px, 1.5vw, 19px)', textDecoration: "none", color: inverted ? "rgba(40,100,160,0.85)" : "rgba(150,200,255,0.85)" }}>
                PEAR Laboratory — Princeton Engineering Anomalies Research
              </a>
              <a href="https://noosphere.princeton.edu/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 'clamp(13px, 1.5vw, 19px)', textDecoration: "none", color: inverted ? "rgba(40,100,160,0.85)" : "rgba(150,200,255,0.85)" }}>
                Global Consciousness Project — Princeton
              </a>
              <a href="https://lfdr.de/QRNG/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 'clamp(13px, 1.5vw, 19px)', textDecoration: "none", color: inverted ? "rgba(40,100,160,0.85)" : "rgba(150,200,255,0.85)" }}>
                LfD Laboratory — Quantum Random Number Generation
              </a>

              <h3 style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 'clamp(11px, 1.2vw, 15px)',
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.45,
                marginTop: 'clamp(10px, 1.5vh, 20px)',
                marginBottom: 2,
              }}>
                Watch
              </h3>
              <a href="https://www.youtube.com/watch?v=qw_O9Qiwqew" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 'clamp(13px, 1.5vw, 19px)', textDecoration: "none", color: inverted ? "rgba(40,100,160,0.85)" : "rgba(150,200,255,0.85)" }}>
                Science and the Taboo of Psi — Dean Radin at Google
              </a>
              <a href="https://www.youtube.com/watch?v=ufWPPSh0oPc" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 'clamp(13px, 1.5vw, 19px)', textDecoration: "none", color: inverted ? "rgba(40,100,160,0.85)" : "rgba(150,200,255,0.85)" }}>
                The Science of Collective Consciousness — Roger Nelson
              </a>
              <a href="https://www.youtube.com/watch?v=zeNZg2VUXYU" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 'clamp(13px, 1.5vw, 19px)', textDecoration: "none", color: inverted ? "rgba(40,100,160,0.85)" : "rgba(150,200,255,0.85)" }}>
                Global Consciousness — A Cosmology of Connection
              </a>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
