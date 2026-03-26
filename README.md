# Quantum Sphere

A real-time quantum consciousness visualizer inspired by the Princeton Engineering Anomalies Research (PEAR) Lab and Psyleron MindLamp.

A raymarched sphere floats in silence, driven by a live stream of true quantum random numbers. It barely moves — until the statistics deviate from pure chance. Then the sphere breathes, shifts color, and crosses thresholds that should happen only once in twenty trials, or once in a thousand. The question the experiment poses is whether conscious intention can nudge quantum randomness beyond what chance allows.

## How It Works

Each second, 200 quantum random bytes are fetched from the [LfD Laboratory QRNG](https://www.lfdr.de/QRNG/) — an ID Quantique photon detection device at a German research lab. The least significant bit of each byte is extracted as a binary outcome (0 or 1), and the 200 bits are summed. If the source is truly random, the expected sum is 100.

The **cumulative Z-score** tracks how far the running total deviates from expectation across all trials. The sphere responds:

- **At rest** (|Z| < 1.69): the sphere is nearly still, drifting by ~3%
- **Threshold** (|Z| ≥ 1.69, p ≈ 0.05): the sphere visibly expands and shifts color
- **Resonance** (|Z| ≥ 3.3, p < 0.001): a statistically rare event — the sphere enters a distinct state

## Use It Online

Visit the hosted version *(deployment coming soon)* — no installation required. Press play and observe.

## Run It Locally

```bash
git clone https://github.com/danrezi-gif/Quantum-Sphere.git
cd Quantum-Sphere
npm install
npm run dev
```

Open `http://localhost:5001` and press the play button. No API key needed — the LfD QRNG is free and open.

Each session writes trial-by-trial data to `quantum-logs/` as CSV files.

## The Science

Based on decades of experimental work:

- **Robert Jahn & Brenda Dunne** — PEAR Lab, Princeton (1979–2007). 2.5 million trials showing a small but statistically significant effect of operator intention on random event generators.
- **Dean Radin** — Meta-analyses of mind-matter interaction with RNGs. Effect size small (d ≈ 0.02–0.05) but consistent across 380+ studies.
- **Helmut Schmidt** — Pioneered retroactive PK experiments with pre-recorded random sequences.
- **Global Consciousness Project** — 70-node worldwide RNG network showing ~7 sigma cumulative departure during major world events.

The original Psyleron MindLamp used quantum tunneling noise from FET transistors. This implementation uses photon-based quantum randomness accessed via API, applying the same PEAR statistical protocol.

## Tech Stack

- **Shader**: GLSL raymarched sphere (based on [Shadertoy t3ySzG](https://www.shadertoy.com/view/t3ySzG))
- **Frontend**: React + Three.js via react-three-fiber
- **Backend**: Express + Server-Sent Events
- **QRNG**: LfD Laboratory — ID Quantique photon detection hardware
- **Statistics**: Binomial Z-scores, cumulative deviation (PEAR protocol)

## License

MIT — see [LICENSE](LICENSE)
