/**
 * Expected-tone polyphonic analyzer, run alongside the ordinary single-pitch
 * detector where the score actually contains simultaneous notes (see the
 * `listen-chord` callers in useDrillAudio.ts). Spatial-chord exercises target
 * their three chord tones; ordinary melodies stay on the onset detector.
 *
 * The ordinary detector intentionally follows one pitch after each hammer
 * attack. That is correct for melodies and Prove-It, but a chord needs a
 * simultaneous spectral view instead: this processor measures every target
 * tone independently, each frame, and can report several of them at once
 * from the same frame — however many are given (three for a triad, up to
 * seven or more for a wide chord), since each tone is scored on its own.
 */
// Four thousand samples separate adjacent fundamentals cleanly enough that a
// strong partial of one piano key cannot masquerade as another chord tone.
const WINDOW = 4096;
const HOP = 512;
const CALIBRATION_FRAMES = 12;
// A tone must disappear for several consecutive hops before it can become a
// new arrival again. Brief threshold flutter inside one piano decay is not a
// second hammer strike.
const RELEASE_FRAMES = 10;
// Adjacent guard tones are most ambiguous during the first FFT attack frame.
// Wait through that smear before declaring a wrong key; a real held extra
// remains present, while leakage from the correct chord settles away.
const GUARD_STABLE_FRAMES = 10;
const TUNING_RATIOS = [Math.pow(2, -22 / 1200), 1, Math.pow(2, 22 / 1200)];
const STRETCH = [0, 0.00055];

class ChordProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(WINDOW);
    this.window = new Float32Array(WINDOW);
    for (let index = 0; index < WINDOW; index++) {
      this.window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (WINDOW - 1));
    }
    this.write = 0;
    this.sinceHop = 0;
    this.targets = [];
    this.expectedTargets = [];
    this.baselines = new Map();
    this.calibrationEvidence = new Map();
    this.stableFrames = new Map();
    this.missingFrames = new Map();
    this.reportedPresent = new Set();
    this.calibrationFrames = 0;
    this.listening = false;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'prepare-chord' || data.type === 'listen-chord') {
        const expectedTargets = (Array.isArray(data.targetMidi) ? data.targetMidi : [])
          .map(Number)
          .filter((midi) => Number.isFinite(midi) && midi >= 21 && midi <= 108)
          .map(Math.round);
        const monitorTargets = (Array.isArray(data.monitorMidi) ? data.monitorMidi : expectedTargets)
          .map(Number)
          .filter((midi) => Number.isFinite(midi) && midi >= 21 && midi <= 108)
          .map(Math.round);
        const targets = [...new Set([...expectedTargets, ...monitorTargets])].sort((a, b) => a - b);
        const canReuseBaseline =
          data.type === 'listen-chord' &&
          data.reuseBaseline === true &&
          targets.length === this.targets.length &&
          targets.every((midi, index) => midi === this.targets[index]) &&
          targets.every((midi) => this.baselines.has(midi));
        this.targets = targets;
        this.expectedTargets = expectedTargets;
        if (!canReuseBaseline) this.baselines.clear();
        this.calibrationEvidence.clear();
        this.stableFrames.clear();
        this.missingFrames.clear();
        this.reportedPresent.clear();
        this.calibrationFrames = canReuseBaseline ? 0 : CALIBRATION_FRAMES;
        this.reportEnabled = data.type === 'listen-chord';
        this.listening = true;
        if (canReuseBaseline) this.port.postMessage({ type: 'chord-ready' });
      } else if (data.type === 'idle') {
        this.listening = false;
        this.reportEnabled = false;
        this.targets = [];
        this.expectedTargets = [];
        this.calibrationFrames = 0;
        this.calibrationEvidence.clear();
        this.stableFrames.clear();
        this.missingFrames.clear();
        this.reportedPresent.clear();
      }
    };
  }

  _magnitude(frequency) {
    const cacheKey = Math.round(frequency * 100);
    const cached = this.magnitudeCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const cosine = Math.cos(omega);
    const sine = Math.sin(omega);
    const coefficient = 2 * cosine;
    let previous = 0;
    let previousTwo = 0;
    for (let index = 0; index < WINDOW; index++) {
      const sample = this.ring[(this.write + index) % WINDOW] * this.window[index];
      const current = sample + coefficient * previous - previousTwo;
      previousTwo = previous;
      previous = current;
    }
    const real = previous - previousTwo * cosine;
    const imaginary = previousTwo * sine;
    const magnitude = (2 * Math.sqrt(real * real + imaginary * imaginary)) / WINDOW;
    this.magnitudeCache.set(cacheKey, magnitude);
    return magnitude;
  }

  _toneEvidence(midi) {
    const fundamental = 440 * Math.pow(2, (midi - 69) / 12);
    let bestFundamental = 0;
    let bestScore = 0;
    let bestFrequency = fundamental;
    const expected = this.expectedTargets.includes(midi);
    for (const tuning of TUNING_RATIOS) {
      for (const stretch of expected ? STRETCH : [0]) {
        let score = 0;
        let first = 0;
        for (let harmonic = 1; harmonic <= 5; harmonic++) {
          const frequency = fundamental * tuning * harmonic *
            (1 + stretch * (harmonic * harmonic - 1));
          if (frequency >= sampleRate / 2) break;
          const magnitude = this._magnitude(frequency);
          if (harmonic === 1) first = magnitude;
          score += magnitude / Math.sqrt(harmonic);
        }
        if (score > bestScore) {
          bestScore = score;
          bestFundamental = first;
          bestFrequency = fundamental * tuning;
        }
      }
    }
    // Harmonic templates alone are ambiguous: C's upper partials can line up
    // with parts of E/G templates. A real target key must contribute its own
    // fundamental, and that fundamental must not merely be an overtone of a
    // louder key one or more octaves/partials below it.
    let strongestLowerParent = 0;
    for (let divisor = 2; divisor <= 5; divisor++) {
      const parentFrequency = bestFrequency / divisor;
      if (parentFrequency < 27.5) continue;
      strongestLowerParent = Math.max(strongestLowerParent, this._magnitude(parentFrequency));
    }
    const adjacentEnergy = Math.max(
      this._magnitude(bestFrequency * Math.pow(2, -1 / 12)),
      this._magnitude(bestFrequency * Math.pow(2, 1 / 12)),
    );
    return {
      fundamental: bestFundamental,
      score: bestScore,
      purity: bestFundamental / Math.max(1e-10, bestScore),
      parentRatio: strongestLowerParent / Math.max(1e-10, bestFundamental),
      neighborRatio: bestFundamental / Math.max(1e-10, adjacentEnergy),
    };
  }

  _analyze() {
    this.magnitudeCache = new Map();
    let squareSum = 0;
    for (let index = 0; index < WINDOW; index++) {
      const sample = this.ring[index];
      squareSum += sample * sample;
    }
    const rms = Math.sqrt(squareSum / WINDOW);
    this.port.postMessage({ type: 'chord-level', level: Math.min(1, rms / 0.035) });

    const evidence = this.targets.map((midi) => ({ midi, ...this._toneEvidence(midi) }));
    if (this.calibrationFrames > 0) {
      for (const tone of evidence) {
        const samples = this.calibrationEvidence.get(tone.midi) || [];
        samples.push({ fundamental: tone.fundamental, score: tone.score });
        this.calibrationEvidence.set(tone.midi, samples);
      }
      this.calibrationFrames -= 1;
      if (this.calibrationFrames === 0) {
        for (const [midi, samples] of this.calibrationEvidence) {
          const percentile = (key) => {
            const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
            return values[Math.min(values.length - 1, Math.floor(values.length * 0.8))] || 0;
          };
          this.baselines.set(midi, {
            fundamental: percentile('fundamental'),
            score: percentile('score'),
          });
        }
        this.calibrationEvidence.clear();
        this.port.postMessage({ type: 'chord-ready' });
        if (!this.reportEnabled) this.listening = false;
      }
      return;
    }

    const currentlyPresent = new Set();
    for (const tone of evidence) {
      const expectedTone = this.expectedTargets.includes(tone.midi);
      const baseline = this.baselines.get(tone.midi) || { fundamental: 0, score: 0 };
      const fundamentalThreshold = Math.max(
        0.000035,
        baseline.fundamental * 2.15 + 0.000018,
        rms * 0.022,
      );
      const scoreThreshold = Math.max(
        0.00009,
        baseline.score * 2 + 0.00004,
        rms * 0.055,
      );
      const present =
        tone.fundamental >= fundamentalThreshold &&
        tone.score >= scoreThreshold &&
        tone.purity >= (expectedTone ? 0.2 : 0.23) &&
        tone.parentRatio <= 1.05 &&
        tone.neighborRatio >= (expectedTone ? 1.06 : 0.72);
      const stable = present ? (this.stableFrames.get(tone.midi) || 0) + 1 : 0;
      this.stableFrames.set(tone.midi, stable);
      const missing = present ? 0 : (this.missingFrames.get(tone.midi) || 0) + 1;
      this.missingFrames.set(tone.midi, missing);
      const requiredStableFrames = expectedTone ? 2 : GUARD_STABLE_FRAMES;
      if (
        stable >= requiredStableFrames ||
        (this.reportedPresent.has(tone.midi) && missing < RELEASE_FRAMES)
      ) {
        currentlyPresent.add(tone.midi);
      }
    }
    const changed =
      currentlyPresent.size !== this.reportedPresent.size ||
      [...currentlyPresent].some((midi) => !this.reportedPresent.has(midi));
    if (this.reportEnabled && changed) {
      // Send the complete current set on edges only. A held chord therefore
      // produces one arrival, not dozens of fake repeated notes; adding the
      // root later still re-sends the already-held third/fifth in this set.
      this.port.postMessage({
        type: 'chord-tones',
        midi: [...currentlyPresent],
        expectedMidi: [...this.expectedTargets],
        time: currentTime,
      });
      this.reportedPresent = currentlyPresent;
    }
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let index = 0; index < channel.length; index++) {
      this.ring[this.write] = channel[index];
      this.write = (this.write + 1) % WINDOW;
      this.sinceHop += 1;
    }
    if (this.listening && this.targets.length > 0 && this.sinceHop >= HOP) {
      this.sinceHop %= HOP;
      this._analyze();
    }
    return true;
  }
}

registerProcessor('chord-processor', ChordProcessor);
