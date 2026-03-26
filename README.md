# Quantum Sphere — MindLamp

A real-time quantum consciousness visualizer inspired by the PEAR Lab and Psyleron MindLamp experiments.

Streams true quantum random numbers, computes cumulative statistical deviation (Z-score), and renders a raymarched sphere whose size and color respond to the quantum state — nearly still at rest, visibly shifting only when a statistically significant threshold is crossed.

## The Experiment

Based on Robert Jahn's Princeton Engineering Anomalies Research (PEAR) and Dean Radin's psychokinetic studies:

- **200 quantum random bits** are fetched per trial from a true QRNG source
- Each trial computes a **Z-score** measuring deviation from expected randomness
- The **cumulative Z** tracks the running statistical departure across all trials
- At **|Z| ≥ 1.69** (p ≈ 0.05), the sphere shifts — a statistically significant deviation
- At **|Z| ≥ 3.3** (p < 0.001), the sphere enters a "resonance" state

The original MindLamp used FET transistor quantum tunneling noise. This implementation uses photon-based quantum random number generators accessed via API.

## Quantum Sources

| Source | Type | Rate Limit | Key Required |
|--------|------|------------|--------------|
| **LfD Laboratory** (Germany) | ID Quantique photon detection | None documented | No |
| **ANU QRNG** (Australia) | Quantum vacuum fluctuation | 100 req/month free, $0.005/req paid | Yes |
| **QCI uQRNG** | Photon superposition | 1 billion bits/month free | Yes |

## Setup

```bash
git clone https://github.com/danrezi-gif/Quantum-Sphere.git
cd Quantum-Sphere
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5001` and press the play button.

## Tech Stack

- **Visualization:** React + Three.js (react-three-fiber) — raymarched sphere shader
- **Engine:** Express + Server-Sent Events — real-time quantum stream
- **Statistics:** PEAR protocol — 200-bit trials, binomial Z-scores, cumulative deviation

## Session Logs

Each session writes a CSV to `quantum-logs/` with columns: `trial, bitSum, trialZ, cumZ, timestamp`.

## References

- Jahn, R.G. & Dunne, B.J. (2005). *The PEAR Proposition.* Journal of Scientific Exploration.
- Radin, D. (2006). *Entangled Minds.* Paraview Pocket Books.
- Nelson, R. et al. *Global Consciousness Project.* https://noosphere.princeton.edu
- Psyleron. *MindLamp & REG-1.* https://www.psyleron.com

## License

GPL-3.0 — see [LICENSE](LICENSE)
