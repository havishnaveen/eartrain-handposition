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
const WINDOW = 2048;
const HOP = 512;
const CALIBRATION_FRAMES = 5;
// A tone must disappear for several consecutive hops before it can become a
// new arrival again. Brief threshold flutter inside one piano decay is not a
// second hammer strike.
const RELEASE_FRAMES = 10;
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
    this.baselines = new Map();
    this.stableFrames = new Map();
    this.missingFrames = new Map();
    this.reportedPresent = new Set();
    this.calibrationFrames = 0;
    this.listening = false;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'listen-chord') {
        this.targets = (Array.isArray(data.targetMidi) ? data.targetMidi : [])
          .map(Number)
          .filter((midi) => Number.isFinite(midi) && midi >= 21 && midi <= 108)
          .map(Math.round);
        this.baselines.clear();
        this.stableFrames.clear();
        this.missingFrames.clear();
        this.reportedPresent.clear();
        this.calibrationFrames = CALIBRATION_FRAMES;
        this.listening = true;
      } else if (data.type === 'idle') {
        this.listening = false;
        this.targets = [];
        this.stableFrames.clear();
        this.missingFrames.clear();
        this.reportedPresent.clear();
      }
    };
  }

  _magnitude(frequency) {
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
    return (2 * Math.sqrt(real * real + imaginary * imaginary)) / WINDOW;
  }

  _toneEvidence(midi) {
    const fundamental = 440 * Math.pow(2, (midi - 69) / 12);
    let bestFundamental = 0;
    let bestScore = 0;
    for (const tuning of TUNING_RATIOS) {
      for (const stretch of STRETCH) {
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
        }
      }
    }
    return { fundamental: bestFundamental, score: bestScore };
  }

  _analyze() {
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
        const baseline = this.baselines.get(tone.midi) || { fundamental: 0, score: 0 };
        baseline.fundamental = Math.max(baseline.fundamental, tone.fundamental);
        baseline.score = Math.max(baseline.score, tone.score);
        this.baselines.set(tone.midi, baseline);
      }
      this.calibrationFrames -= 1;
      if (this.calibrationFrames === 0) this.port.postMessage({ type: 'chord-ready' });
      return;
    }

    const currentlyPresent = new Set();
    for (const tone of evidence) {
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
      const present = tone.fundamental >= fundamentalThreshold && tone.score >= scoreThreshold;
      const stable = present ? (this.stableFrames.get(tone.midi) || 0) + 1 : 0;
      this.stableFrames.set(tone.midi, stable);
      const missing = present ? 0 : (this.missingFrames.get(tone.midi) || 0) + 1;
      this.missingFrames.set(tone.midi, missing);
      if (stable >= 2 || (this.reportedPresent.has(tone.midi) && missing < RELEASE_FRAMES)) {
        currentlyPresent.add(tone.midi);
      }
    }
    const changed =
      currentlyPresent.size !== this.reportedPresent.size ||
      [...currentlyPresent].some((midi) => !this.reportedPresent.has(midi));
    if (changed) {
      // Send the complete current set on edges only. A held chord therefore
      // produces one arrival, not dozens of fake repeated notes; adding the
      // root later still re-sends the already-held third/fifth in this set.
      this.port.postMessage({ type: 'chord-tones', midi: [...currentlyPresent], time: currentTime });
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
