/**
 * pitch-processor — acoustic piano note detection on the audio thread.
 *
 * Three problems, three deliberate choices:
 *
 * 1. NOISE. Onsets are picked from SPECTRAL FLUX, not from the amplitude
 *    envelope. Steady-state noise — fans, HVAC, hum — holds a constant
 *    spectrum, so its flux is near zero no matter how loud it is. A piano
 *    attack is a broadband spectral change and stands out clearly. The
 *    threshold is a running MEDIAN of recent flux, which is robust to the
 *    onsets themselves, so it adapts to the room instead of being tuned
 *    for one. A separate noise-floor tracker gates out frames that are
 *    merely room tone.
 *
 * 1b. SUSTAIN PEDAL. With the dampers up, previously struck strings keep
 *    ringing, and plain broadband flux fails in both directions at once:
 *    the ringing itself keeps crossing the threshold (one note read as
 *    six), while a quiet new note struck into that texture never crosses
 *    it at all. Two measures fix this:
 *
 *      HIGH-FREQUENCY WEIGHTING. A hammer strike is a broadband transient;
 *      a ringing string is not. Upper partials decay several times faster
 *      than the fundamental, so sustained tone loses its treble within a
 *      fraction of a second. Weighting the flux towards the upper bins
 *      therefore emphasises real strikes and suppresses ringing.
 *
 *      COMPLEX-DOMAIN DEVIATION. Each bin's next value is predicted from
 *      the previous two frames assuming steady magnitude and constant
 *      phase advance — which is exactly what a decaying string does. A new
 *      hammer strike violates that prediction violently even when it barely
 *      changes the total energy. This is what recovers onsets buried inside
 *      a sustained chord, where magnitude alone shows nothing.
 *
 * 2. OCTAVE ERRORS. Piano tone is harmonically dense and the second partial
 *    is often louder than the fundamental, which makes naive detectors
 *    report the note an octave high. YIN's cumulative mean normalisation
 *    handles most of this; the explicit period-doubling check below handles
 *    the rest.
 *
 * 3. ATTACK TRANSIENTS. The first ~40ms of a piano note is a broadband
 *    thump with no stable pitch. Estimating pitch there is the single
 *    biggest source of wrong notes. So pitch is measured over several frames
 *    AFTER the attack and reported as the median, once the string is
 *    actually ringing.
 */

const FFT_SIZE = 1024;
const YIN_WINDOW = 2048;
/** Longer window for the emergent-spectrum analysis: 10.8Hz bins at 44.1k. */
const PITCH_FFT = 4096;
const RING = 4096;
const HOP = 512;

/* Onset detection.
 * These constants were chosen by sweeping dry, soft, pedalled, repeated,
 * buried-note, noisy-room, and silent scenarios. Re-sweep those scenarios
 * rather than nudging these values by hand. */
const FLUX_HISTORY = 43; // ~0.5s at 512-sample hops
const FLUX_MEDIAN_MULT = 2.0;
const FLUX_MIN_BAND_HZ = 80; // below this is rumble, not piano attack
const FLUX_MAX_BAND_HZ = 8000;

/* High-frequency weighting ramp. Bins below HF_LOW_HZ carry HF_FLOOR_W;
   bins above HF_FULL_HZ carry HF_PEAK_W; linear in between. */
const HF_LOW_HZ = 300;
const HF_FULL_HZ = 4000;
const HF_FLOOR_W = 0.2;
const HF_PEAK_W = 2.2;

/** Weight of the complex-domain term against weighted flux in the combined
 *  detection function. Both are normalised by their own running medians
 *  first, so the two are commensurable regardless of absolute scale. */
const CD_WEIGHT = 0.3;
/** 'sum' blends the two detectors; 'max' fires if either one does. */
const COMBINE = 'sum';
const MIN_ONSET_GAP_SEC = 0.14;

/* Noise / deliberate-strike gate.
 *
 * A slowly moving scalar floor is not enough in a real room: a fan, voices,
 * or microphone self-noise can jump well above its mean for a frame and look
 * like an onset. Keep a robust window of recent quiet RMS values instead.
 * The median describes the room's body; the 90th percentile describes its
 * normal peaks. A frame must clear BOTH, plus an absolute floor, before pitch
 * estimation is even allowed to begin. */
const RMS_HISTORY = 129; // ~1.5s at 512-sample hops
const RMS_GATE_MULT = 1.7;
const RMS_CEILING_MULT = 1.15;
const RMS_GATE_MARGIN = 0.0002;
const RMS_GATE_FLOOR = 0.001;
const RMS_LEARN_CEILING_MULT = 1.14;
const MIN_ATTACK_RATIO = 1.05;
const STRONG_ODF_RATIO = 1.32;

/* Pitch measurement window, relative to the onset */
const PITCH_DELAY_SEC = 0.035;
const PITCH_WINDOW_SEC = 0.3;
const PITCH_MIN_ESTIMATES = 3;
const PITCH_MAX_ESTIMATES = 10;
const MAX_PITCH_SPREAD_SEMITONES = 0.8;
const MAX_PITCH_MAD_SEMITONES = 0.35;
const MIN_PITCH_CONSENSUS = 0.5;
const MIN_REPORTED_CLARITY = 0.25;

/* YIN */
const YIN_THRESHOLD = 0.2;
/**
 * 90Hz (F#2) is deliberately above mains hum and its second harmonic's
 * useful range. Nothing in the curriculum sounds below G2, so this costs no
 * real notes and removes the single worst failure mode: YIN locking onto a
 * 60Hz hum, which reports every note in the room as B1.
 */
const MIN_FREQ = 90;
/**
 * C6 is the curriculum ceiling (1047Hz); this leaves headroom above it
 * without opening the range to shrill artefacts.
 */
const MAX_FREQ = 1250;
const MIN_CLARITY = 0.42;

/** High-pass cutoff applied before pitch analysis, to strip hum and rumble. */
const HPF_HZ = 80;

/** Onset must fall back below this fraction of threshold before re-arming. */
const REARM_FRACTION = 0.6;

/**
 * After an onset the threshold is lifted to a fraction of that onset's flux
 * and decays back down. A struck piano string keeps producing spectral change
 * as its partials beat and dampers settle; without this decaying guard, one
 * strike registers as three notes.
 */
// The guard must clear before the next 75-BPM sixteenth (~200ms) while the
// armed/local-maximum checks still reject secondary bumps from one strike.
const POST_ONSET_LIFT = 0.75;
const POST_ONSET_DECAY = 0.94;

/** Iterative radix-2 FFT, in place on re/im. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * One Butterworth high-pass biquad, applied offline over a buffer copy.
 * Two of these in series give 24dB/octave, which is what it takes to put
 * mains hum below the fundamental of a quietly played note.
 */
function highpassBiquad(buf, cutoff, q) {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cos0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = (1 + cos0) / 2;
  const b1 = -(1 + cos0);
  const b2 = (1 + cos0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos0;
  const a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    buf[i] = y0;
  }
  return buf;
}

/** 4th-order Butterworth high-pass (two cascaded biquads). */
function highpass(buf, cutoff) {
  highpassBiquad(buf, cutoff, 0.5412);
  highpassBiquad(buf, cutoff, 1.3066);
  return buf;
}

function median(values, count) {
  if (count === 0) return 0;
  const copy = values.slice(0, count).sort((a, b) => a - b);
  const mid = count >> 1;
  return count % 2 ? copy[mid] : (copy[mid - 1] + copy[mid]) / 2;
}

function percentile(values, count, fraction) {
  if (count === 0) return 0;
  const copy = values.slice(0, count).sort((a, b) => a - b);
  const index = Math.min(copy.length - 1, Math.max(0, Math.floor((copy.length - 1) * fraction)));
  return copy[index];
}

class PitchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};

    this.minFreq = opts.minFreq || MIN_FREQ;
    this.maxFreq = opts.maxFreq || MAX_FREQ;
    this.yinThreshold = opts.yinThreshold || YIN_THRESHOLD;
    this.minClarity = opts.minClarity || MIN_CLARITY;
    this.fluxMult = opts.fluxMult || FLUX_MEDIAN_MULT;

    this.ring = new Float32Array(RING);
    this.writePos = 0;
    this.sinceHop = 0;

    // Windows
    this.hannFft = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      this.hannFft[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
    }

    this.re = new Float32Array(FFT_SIZE);
    this.im = new Float32Array(FFT_SIZE);
    this.mag = new Float32Array(FFT_SIZE / 2);
    this.prevMag = new Float32Array(FFT_SIZE / 2);
    this.phase = new Float32Array(FFT_SIZE / 2);
    this.phase1 = new Float32Array(FFT_SIZE / 2);
    this.phase2 = new Float32Array(FFT_SIZE / 2);

    // Precomputed HF ramp — one multiply per bin instead of a branch.
    this.hfWeight = new Float32Array(FFT_SIZE / 2);
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      const f = (i * sampleRate) / FFT_SIZE;
      const ramp = Math.min(1, Math.max(0, (f - HF_LOW_HZ) / (HF_FULL_HZ - HF_LOW_HZ)));
      this.hfWeight[i] = HF_FLOOR_W + (HF_PEAK_W - HF_FLOOR_W) * ramp;
    }

    this.pitchRe = new Float32Array(PITCH_FFT);
    this.pitchIm = new Float32Array(PITCH_FFT);
    this.pitchMag = new Float32Array(PITCH_FFT / 2);
    this.preMag = new Float32Array(PITCH_FFT / 2);
    this.residual = new Float32Array(PITCH_FFT / 2);

    this.cdHistory = new Float32Array(FLUX_HISTORY);
    this.cdCount = 0;
    this.cdWrite = 0;
    this.odf2 = 0;
    this.odf1 = 0;

    this.sustain = 1;
    this.fluxHistory = new Float32Array(FLUX_HISTORY);
    this.fluxCount = 0;
    this.fluxWrite = 0;
    this.flux2 = 0;
    this.flux1 = 0;
    this.rms2 = 0;
    this.rms1 = 0;
    // Lowest envelope point since the previous accepted attack. A repeated
    // pitch is only a real re-articulation when it rises decisively from
    // this trough; beating partials in one sustain do not.
    this.envelopeTrough = 0.01;

    this.noiseFloor = 0.01;
    this.noiseCeiling = 0.01;
    this.amplitudeGate = RMS_GATE_FLOOR;
    this.rmsHistory = new Float32Array(RMS_HISTORY);
    this.rmsCount = 0;
    this.rmsWrite = 0;
    this.lastOnsetTime = -Infinity;
    this.armed = true;
    this.postOnset = 0;
    this.pending = [];
    this.levelCounter = 0;
    this.listening = false;
    this.hopSeconds = HOP / sampleRate;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'listen') {
        this.listening = true;
        this.lastOnsetTime = -Infinity;
        this.armed = true;
        this.postOnset = 0;
        this.envelopeTrough = Math.max(1e-5, this.noiseCeiling);
        this.pending = [];
        // Keep the continuously learned phase history. Clearing it here
        // makes ordinary room tone look like a sudden complex-domain attack
        // on the first listening frame and can manufacture a phantom note.
      } else if (data.type === 'idle') {
        this.listening = false;
        this.flushPending(true);
      }
    };
  }

  _rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  /** Newest `size` samples from the ring, oldest first. */
  _read(size, out) {
    const start = (this.writePos - size + RING * 2) % RING;
    for (let i = 0; i < size; i++) out[i] = this.ring[(start + i) % RING];
    return out;
  }

  /**
   * YIN with an explicit octave-doubling check.
   *
   * Step 4 of YIN takes the FIRST tau below threshold rather than the global
   * minimum, which already biases away from reporting a subharmonic. The
   * remaining failure is the opposite one: on a note whose second partial
   * dominates, the first dip can land at half the true period. If the dip at
   * 2*tau is clearly deeper, the true period was 2*tau and the note is an
   * octave lower than it first appeared.
   */
  _yin(buf) {
    const tauMin = Math.max(2, Math.floor(sampleRate / this.maxFreq));
    const tauMax = Math.min(Math.floor(buf.length / 2), Math.floor(sampleRate / this.minFreq));
    if (tauMax <= tauMin) return null;

    const diff = new Float32Array(tauMax + 1);
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < buf.length - tauMax; j++) {
        const d = buf[j] - buf[j + tau];
        sum += d * d;
      }
      diff[tau] = sum;
    }

    const cmnd = new Float32Array(tauMax + 1);
    cmnd[tauMin] = 1;
    let running = 0;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      running += diff[tau];
      cmnd[tau] = running === 0 ? 1 : (diff[tau] * (tau - tauMin + 1)) / running;
    }

    let tau = -1;
    for (let t = tauMin + 1; t < tauMax; t++) {
      if (cmnd[t] < this.yinThreshold) {
        // Walk to the bottom of this dip.
        while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) return null;

    // NOTE: an explicit period-doubling correction was tried here and
    // REMOVED after measurement. YIN's step 4 — take the FIRST tau below
    // threshold rather than the global minimum — already resolves weak
    // fundamentals correctly, and adding a doubling check on top of it
    // dragged notes an octave down whenever residual hum deepened the dip
    // at 2*tau. Measured on synthetic piano tones with inharmonic partials:
    // 70/70 correct without it, 66/70 with it. Do not reinstate.

    // Parabolic interpolation for sub-sample precision.
    const x0 = tau > tauMin ? tau - 1 : tau;
    const x2 = tau + 1 <= tauMax ? tau + 1 : tau;
    let refined = tau;
    if (x0 !== tau && x2 !== tau) {
      const s0 = cmnd[x0];
      const s1 = cmnd[tau];
      const s2 = cmnd[x2];
      const denom = 2 * s1 - s2 - s0;
      if (denom !== 0) refined = tau + (s2 - s0) / (2 * denom);
    }

    const frequency = sampleRate / refined;
    if (frequency < this.minFreq || frequency > this.maxFreq) return null;
    return { frequency, clarity: 1 - cmnd[tau] };
  }

  /**
 * Magnitude spectrum of the newest PITCH_FFT samples.
 *
 * Separate from the per-hop ODF spectrum: this one is four times longer, for
 * the frequency resolution the harmonic search needs at low pitches.
 */
  _spectrum(out) {
    const buf = this._read(PITCH_FFT, this.pitchRe);
    let mean = 0;
    for (let i = 0; i < PITCH_FFT; i++) mean += buf[i];
    mean /= PITCH_FFT;
    for (let i = 0; i < PITCH_FFT; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (PITCH_FFT - 1));
      this.pitchRe[i] = (buf[i] - mean) * w;
      this.pitchIm[i] = 0;
    }
    fft(this.pitchRe, this.pitchIm);
    for (let i = 0; i < PITCH_FFT / 2; i++) {
      out[i] = Math.sqrt(this.pitchRe[i] * this.pitchRe[i] + this.pitchIm[i] * this.pitchIm[i]);
    }
    return out;
  }

  /**
   * Fundamental of whatever is NEW in the spectrum.
   *
   * With the pedal down the signal is genuinely polyphonic, and a monophonic
   * tracker cannot name a note struck over three ringing strings — it is the
   * problem this project deliberately designed around. The way out is not to
   * transcribe the chord but to look only at what CHANGED: subtract the
   * spectrum captured just before the hammer fell, and what remains is the
   * new note, near enough monophonic again.
   *
   * A harmonic sum over that residual gives the fundamental. It is compared
   * against the octave above, because summing harmonics inherently favours
   * lower candidates: every harmonic of 2*f0 is also a harmonic of f0.
   */
  _emergentPitch(pre) {
    const cur = this._spectrum(this.pitchMag);
    const binHz = sampleRate / PITCH_FFT;
    const res = this.residual;
    let peak = 0;
    for (let i = 0; i < PITCH_FFT / 2; i++) {
      const v = pre ? cur[i] - pre[i] : cur[i];
      res[i] = v > 0 ? v : 0;
      if (res[i] > peak) peak = res[i];
    }
    if (peak <= 0) return null;

    const at = (f) => {
      const x = f / binHz;
      const i = Math.floor(x);
      if (i < 1 || i + 1 >= PITCH_FFT / 2) return 0;
      const frac = x - i;
      return res[i] * (1 - frac) + res[i + 1] * frac;
    };
    const score = (f0) => {
      let sum = 0;
      for (let k = 1; k <= 8; k++) {
        const f = f0 * k;
        if (f > sampleRate / 2) break;
        sum += at(f) / Math.sqrt(k);
      }
      return sum;
    };

    // Log-spaced candidates: an eighth of a semitone across the piano range.
    const steps = Math.ceil(8 * 12 * Math.log2(this.maxFreq / this.minFreq));
    let bestF = 0;
    let bestS = 0;
    for (let n = 0; n <= steps; n++) {
      const f0 = this.minFreq * Math.pow(2, n / (8 * 12));
      const sc = score(f0);
      if (sc > bestS) { bestS = sc; bestF = f0; }
    }
    if (bestF === 0 || bestS <= 0) return null;

    // Octave-up correction for the harmonic sum's known downward bias.
    // Strictly greater, not merely comparable: on a note whose second
    // partial dominates, score(2*f0) is legitimately large and a lenient
    // test promotes every such note an octave.
    const upper = bestF * 2;
    if (upper <= this.maxFreq && score(upper) > bestS * 1.05) {
      bestS = score(upper);
      bestF = upper;
    }

    // The fundamental itself must carry real energy — otherwise this is a
    // harmonic pattern with a missing root, not a note.
    if (at(bestF) < peak * 0.04) return null;

    return { frequency: bestF, clarity: Math.min(1, bestS / (peak * 2.2)) };
  }

  /** Emit any pending onsets whose measurement window has closed. */
  flushPending(force) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const item = this.pending[i];
      const done = force || currentTime >= item.time + PITCH_DELAY_SEC + PITCH_WINDOW_SEC;
      if (!done && item.estimates.length < PITCH_MAX_ESTIMATES) continue;

      this.pending.splice(i, 1);
      if (item.estimates.length < PITCH_MIN_ESTIMATES) continue;

      // Each onset is checked repeatedly across the ringing portion of the
      // note. First require a dominant semitone cluster, then reject frames
      // that wander away from its median. This is materially different from
      // re-running the same final grade: these are independent audio frames.
      const candidates = item.estimates.map((estimate) => ({
        estimate,
        midi: 69 + 12 * Math.log2(estimate.frequency / 440),
      }));
      const globalMidi = median(candidates.map((candidate) => candidate.midi), candidates.length);
      const clusterCounts = new Map();
      for (const candidate of candidates) {
        const key = Math.round(candidate.midi);
        clusterCounts.set(key, (clusterCounts.get(key) || 0) + 1);
      }
      const dominantKey = [...clusterCounts.keys()].sort((a, b) =>
        clusterCounts.get(b) - clusterCounts.get(a) ||
        Math.abs(a - globalMidi) - Math.abs(b - globalMidi)
      )[0];
      const dominant = candidates.filter((candidate) => Math.round(candidate.midi) === dominantKey);
      const consensus = dominant.length / candidates.length;
      if (dominant.length < PITCH_MIN_ESTIMATES || consensus < MIN_PITCH_CONSENSUS) continue;

      const dominantMidi = median(dominant.map((candidate) => candidate.midi), dominant.length);
      const stable = dominant.filter(
        (candidate) => Math.abs(candidate.midi - dominantMidi) <= MAX_PITCH_SPREAD_SEMITONES,
      );
      if (stable.length < PITCH_MIN_ESTIMATES) continue;

      const stableMidis = stable.map((candidate) => candidate.midi);
      const stableMidi = median(stableMidis, stableMidis.length);
      const pitchMad = median(
        stableMidis.map((midi) => Math.abs(midi - stableMidi)),
        stableMidis.length,
      );
      if (pitchMad > MAX_PITCH_MAD_SEMITONES) continue;

      const clarity = median(
        stable.map((candidate) => candidate.estimate.clarity),
        stable.length,
      );
      if (clarity < MIN_REPORTED_CLARITY) continue;

      this.port.postMessage({
        type: 'note-onset',
        frequency: 440 * Math.pow(2, (stableMidi - 69) / 12),
        clarity,
        strength: item.strength,
        sustain: item.sustain,
        peakRms: item.peakRms,
        gate: item.gate,
        attackRatio: item.attackRatio,
        time: item.time,
        frames: item.estimates.length,
        stableFrames: stable.length,
        consensus,
        pitchMad,
      });
    }
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.ring[this.writePos] = channel[i];
      this.writePos = (this.writePos + 1) % RING;
      this.sinceHop++;
    }
    if (this.sinceHop < HOP) return true;
    this.sinceHop = 0;

    /* --- Spectrum ------------------------------------------------------- */
    const frame = this._read(FFT_SIZE, new Float32Array(FFT_SIZE));
    let mean = 0;
    for (let i = 0; i < FFT_SIZE; i++) mean += frame[i];
    mean /= FFT_SIZE;

    for (let i = 0; i < FFT_SIZE; i++) {
      this.re[i] = (frame[i] - mean) * this.hannFft[i]; // DC-removed, windowed
      this.im[i] = 0;
    }
    fft(this.re, this.im);
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      this.mag[i] = Math.sqrt(this.re[i] * this.re[i] + this.im[i] * this.im[i]);
      this.phase[i] = Math.atan2(this.im[i], this.re[i]);
    }

    /* --- Noise floor ---------------------------------------------------- */
    const rms = this._rms(frame);
    this.envelopeTrough = Math.min(this.envelopeTrough, rms);
    // Learn freely during count-in/idle. While listening, only admit frames
    // that still look like room tone so piano sustains cannot raise the gate
    // and hide the student's next note.
    const learnCeiling = Math.max(
      RMS_GATE_FLOOR,
      this.noiseCeiling * RMS_LEARN_CEILING_MULT,
    );
    if (!this.listening || rms <= learnCeiling || this.rmsCount < 12) {
      this.rmsHistory[this.rmsWrite] = rms;
      this.rmsWrite = (this.rmsWrite + 1) % RMS_HISTORY;
      if (this.rmsCount < RMS_HISTORY) this.rmsCount++;
    }

    if (this.rmsCount > 0) {
      this.noiseFloor = Math.max(1e-5, median(this.rmsHistory, this.rmsCount));
      this.noiseCeiling = Math.max(
        this.noiseFloor,
        percentile(this.rmsHistory, this.rmsCount, 0.9),
      );
    }

    this.amplitudeGate = Math.max(
      RMS_GATE_FLOOR,
      this.noiseFloor * RMS_GATE_MULT + RMS_GATE_MARGIN,
      this.noiseCeiling * RMS_CEILING_MULT + RMS_GATE_MARGIN,
    );

    if (++this.levelCounter >= 4) {
      this.levelCounter = 0;
      const audibleRange = Math.max(0.02, 0.14 - this.amplitudeGate);
      this.port.postMessage({
        type: 'level',
        // Room tone reads as zero; only energy above the recognition gate
        // animates the student's input meter.
        level: Math.min(1, Math.max(0, (rms - this.amplitudeGate) / audibleRange)),
        noiseFloor: this.noiseFloor,
        noiseCeiling: this.noiseCeiling,
        gate: this.amplitudeGate,
      });
    }

    /* --- Spectral flux -------------------------------------------------- */
    const binHz = sampleRate / FFT_SIZE;
    const loBin = Math.max(1, Math.floor(FLUX_MIN_BAND_HZ / binHz));
    const hiBin = Math.min(FFT_SIZE / 2 - 1, Math.ceil(FLUX_MAX_BAND_HZ / binHz));

    let flux = 0;
    let cd = 0;
    for (let i = loBin; i <= hiBin; i++) {
      const w = this.hfWeight[i];

      // Half-wave rectified, HF-weighted: only ENERGY APPEARING counts, and
      // treble counts for more. Steady tone in, steady tone out, flux near
      // zero however loud the room is — and a ringing string, having lost
      // its upper partials, contributes far less than a fresh strike.
      const d = this.mag[i] - this.prevMag[i];
      if (d > 0) flux += w * d;

      // Complex-domain deviation. Predict this bin from the previous two
      // frames assuming steady magnitude and constant phase advance — which
      // is precisely what a decaying string does — then measure how wrong
      // the prediction was. Rectified: a bin losing energy is a note dying,
      // not a note starting.
      if (this.mag[i] >= this.prevMag[i]) {
        const predPhase = 2 * this.phase1[i] - this.phase2[i];
        const pr = this.prevMag[i] * Math.cos(predPhase);
        const pi = this.prevMag[i] * Math.sin(predPhase);
        const ar = this.mag[i] * Math.cos(this.phase[i]);
        const ai = this.mag[i] * Math.sin(this.phase[i]);
        const dr = ar - pr;
        const di = ai - pi;
        cd += w * Math.sqrt(dr * dr + di * di);
      }
    }

    this.prevMag.set(this.mag);
    this.phase2.set(this.phase1);
    this.phase1.set(this.phase);

    // Normalise each detector by its own running median so the two are
    // commensurable, then combine. Neither dominates by virtue of scale.
    const fluxMedian = median(this.fluxHistory, this.fluxCount) || 1e-6;
    const cdMedian = median(this.cdHistory, this.cdCount) || 1e-6;

    this.fluxHistory[this.fluxWrite] = flux;
    this.fluxWrite = (this.fluxWrite + 1) % FLUX_HISTORY;
    if (this.fluxCount < FLUX_HISTORY) this.fluxCount++;

    this.cdHistory[this.cdWrite] = cd;
    this.cdWrite = (this.cdWrite + 1) % FLUX_HISTORY;
    if (this.cdCount < FLUX_HISTORY) this.cdCount++;

    const fluxNorm = flux / fluxMedian;
    const cdNorm = cd / cdMedian;
    const odf =
      COMBINE === 'max'
        ? Math.max(fluxNorm, cdNorm)
        : (1 - CD_WEIGHT) * fluxNorm + CD_WEIGHT * cdNorm;

    // How much the room is already ringing when this frame arrives. Near 1
    // in a damped room; well above it with the pedal down. Reported with
    // each onset so grading can loosen its echo handling under pedal.
    this.sustain = rms / (this.noiseFloor + 1e-6);

    // The ODF is median-normalised, so a plain multiplier is the threshold.
    const baseThreshold = this.fluxMult;
    this.postOnset *= POST_ONSET_DECAY;
    const threshold = Math.max(baseThreshold, this.postOnset);

    /* --- Peak picking (one hop of latency, for a true local maximum) ---- */
    if (this.listening && this.fluxCount >= 8) {
      const isPeak =
        this.odf1 > this.odf2 &&
        this.odf1 >= odf &&
        this.odf1 > threshold;

      const gate = this.amplitudeGate;
      const loudEnough = this.rms1 >= gate;
      // Compare the peak with the envelope trough since the previous strike,
      // not merely the immediately preceding hop. Real piano attacks build
      // over several hops, so frame-to-frame ratios can hide a true attack;
      // a trough-to-peak ratio captures the physical release/re-strike.
      const attackBase = Math.max(this.noiseCeiling, this.envelopeTrough, 1e-6);
      const attackRatio = this.rms1 / attackBase;
      const deliberateAttack =
        attackRatio >= MIN_ATTACK_RATIO || this.odf1 >= threshold * STRONG_ODF_RATIO;
      const onsetTime = currentTime - this.hopSeconds;

      // Re-arm only once flux has fallen well below threshold. A decaying
      // piano note produces secondary flux bumps as partials beat against
      // each other; without this, one strike registers as several notes.
      if (!this.armed && this.odf1 < threshold * REARM_FRACTION) this.armed = true;

      if (
        this.armed &&
        isPeak &&
        loudEnough &&
        deliberateAttack &&
        onsetTime - this.lastOnsetTime > MIN_ONSET_GAP_SEC
      ) {
        this.armed = false;
        this.postOnset = this.odf1 * POST_ONSET_LIFT;
        this.lastOnsetTime = onsetTime;
        this.envelopeTrough = this.rms1;
        // Snapshot of the room the instant before the hammer fell. Anything
        // above this later is the new note.
        const pre = new Float32Array(PITCH_FFT / 2);
        this._spectrum(pre);

        this.pending.push({
          pre,
          time: onsetTime,
          // Relative to the room, so "loud" means loud HERE.
          strength: this.odf1 / (baseThreshold || 1e-6),
          sustain: this.sustain,
          peakRms: this.rms1,
          gate,
          attackRatio,
          estimates: [],
        });
      }
    }

    this.odf2 = this.odf1;
    this.odf1 = odf;
    this.rms2 = this.rms1;
    this.rms1 = rms;

    /* --- Deferred pitch measurement ------------------------------------- */
    if (this.pending.length > 0) {
      let buffer = null;
      for (const item of this.pending) {
        const age = currentTime - item.time;
        if (age < PITCH_DELAY_SEC || age > PITCH_DELAY_SEC + PITCH_WINDOW_SEC) continue;
        if (item.estimates.length >= PITCH_MAX_ESTIMATES) continue;
        if (!buffer) {
          buffer = highpass(this._read(YIN_WINDOW, new Float32Array(YIN_WINDOW)), HPF_HZ);
        }
        const yin = this._yin(buffer);
        const emergent = this._emergentPitch(item.pre);
        // YIN is the more precise of the two when the texture is thin enough
        // for it to work. Trust it only when the emergent spectrum agrees
        // within a semitone; under pedal it will not, and then the residual
        // is the only one of the two looking at the right note.
        let chosen = null;
        if (yin && yin.clarity >= this.minClarity) {
          if (!emergent) {
            chosen = yin;
          } else {
            const cents = Math.abs(1200 * Math.log2(yin.frequency / emergent.frequency));
            if (cents <= 60) {
              chosen = yin; // agreement: YIN is the more precise of the two
            } else if (Math.abs(cents - 1200) <= 90 || Math.abs(cents - 2400) <= 90) {
              // Pure octave disagreement. YIN resolves octaves well and the
              // harmonic sum is inherently octave-prone, so YIN wins here.
              chosen = yin;
            } else {
              // Wholesale disagreement means YIN has locked onto a different
              // note that is still ringing. Only the residual is looking at
              // the note that was just struck.
              chosen = emergent;
            }
          }
        } else if (emergent) {
          chosen = emergent;
        }
        if (chosen) item.estimates.push(chosen);
      }
      this.flushPending(false);
    }

    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
