# Quantum Sphere / Mindlamp

**An audiovisual experiment with attention, intention and quantum randomness.**

A raymarched sphere responds in real time to a stream of hardware-generated quantum random numbers. At rest it breathes gently; as cumulative deviations from expectation grow, its scale and visual state change.

The work is inspired by historical experiments on mind–matter interaction and by devices such as Psyleron's MindLamp. It does **not** claim that attention or intention has been shown here to influence quantum randomness. Instead, it creates a perceptual setting in which uncertainty, expectation, statistical deviation and the human tendency to search for meaning can be experienced together.

**Live:** https://mindlamp.monkadelic.me/

## How it works

Each second, 200 quantum random bytes are fetched from the [LfD Laboratory QRNG](https://www.lfdr.de/QRNG/), which uses ID Quantique photon-detection hardware. The least significant bit of each byte is treated as a binary outcome, producing a stream of 0s and 1s.

The interface tracks the cumulative deviation from the expected 50/50 distribution using a Z-score. The sphere uses that statistical state as visual input.

This makes the interface reactive to the random process without turning unusual fluctuations into evidence of a psychological or physical effect.

## Use it online

Open https://mindlamp.monkadelic.me/ and press play.

The experience is intended to be observed rather than "won": notice how quickly statistical movement acquires emotional or symbolic significance once it is given visual form.

## Run it locally

```bash
git clone https://github.com/danrezi-gif/Quantum-Sphere.git
cd Quantum-Sphere
npm install
npm run dev
```

Open `http://localhost:5001` and press play.

No API key is required for the public LfD QRNG endpoint. Sessions write trial-level data to `quantum-logs/` as CSV files.

## Background

The project takes as cultural and research context a long, contested history of experiments involving random-event generators, intention and consciousness, including work associated with PEAR, Helmut Schmidt, Psyleron and the Global Consciousness Project.

Those literatures remain debated, and this project does not treat them as settled evidence. Their importance here is partly conceptual: they offer a strange experimental vocabulary for asking how humans relate attention, chance, pattern and meaning.

## Tech stack

- **GLSL** — raymarched sphere
- **React + Three.js / react-three-fiber** — interface and rendering
- **Express + Server-Sent Events** — live data stream
- **LfD / ID Quantique** — hardware quantum random-number source
- **Statistics** — binomial sampling and cumulative Z-score

## Context

Quantum Sphere / Mindlamp is part of [Monkadelic](https://monkadelic.me), Daniel Rezinovsky's experimental practice across consciousness, art and technology.

## License

MIT — see [LICENSE](LICENSE).