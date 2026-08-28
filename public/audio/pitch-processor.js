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
/** Above B4, short stiff strings need stretched-partial spectral templates. */
const UPPER_REGISTER_MIN_FREQ = 480;
const UPPER_INHARMONICITY_BANK = [0, 0.0003, 0.0006, 0.00095];
// Two pitch windows, so an onset can retain a genuinely pre-attack spectrum
// while the current ringing spectrum is measured later.
const RING = 8192;
const HOP = 512;
/**
 * Raw microphone capture is intentionally separate from real-time event
 * detection. The worklet still emits immediate note events for responsive
 * UI, while the completed lossless take is sent to the score-aware worker
 * for the final grade. Chunks are large enough to keep MessagePort traffic
 * off the audio thread's hot path.
 */
const CAPTURE_CHUNK_SAMPLES = 16384;

/* Onset detection.
 * These constants were chosen by sweeping dry, soft, pedalled, repeated,
 * buried-note, noisy-room, and silent scenarios. Re-sweep those scenarios
 * rather than nudging these values by hand. */
const FLUX_HISTORY = 43; // ~0.5s at 512-sample hops
const FLUX_MEDIAN_MULT = 1.85;
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
// Keep the live UI agile enough for a 120-BPM sixteenth (125 ms). Duplicate
// protection comes from re-arming, the decaying post-onset guard, and the
// same-pitch re-articulation check—not from globally deleting every attack
// that happens inside 140 ms.
const MIN_ONSET_GAP_SEC = 0.095;

/* Noise / deliberate-strike gate.
 *
 * A slowly moving scalar floor is not enough in a real room: a fan, voices,
 * or microphone self-noise can jump well above its mean for a frame and look
 * like an onset. Keep a robust window of recent quiet RMS values instead.
 * The median describes the room's body; the 90th percentile describes its
 * normal peaks. A frame must clear BOTH, plus an absolute floor, before pitch
 * estimation is even allowed to begin. */
const RMS_HISTORY = 129; // ~1.5s at 512-sample hops
const RMS_GATE_MULT = 1.45;
const RMS_CEILING_MULT = 1.05;
const RMS_GATE_MARGIN = 0.00008;
const RMS_GATE_FLOOR = 0.0005;
const RMS_LEARN_CEILING_MULT = 1.1;
/** Minimum one-hop RMS rise for a conventional hammer attack. */
const MIN_FRAME_ATTACK_RATIO = 1.08;
/** A gentler legato attack can use spectral novelty, but its energy may not fall. */
const MIN_ATTACK_NOVELTY = 0.24;
const STRONG_ATTACK_NOVELTY = 0.35;
const LEGATO_MIN_FRAME_RATIO = 0.97;

/* Pitch measurement window, relative to the onset */
const PITCH_DELAY_SEC = 0.035;
// Stop before a following sixteenth-note attack can contaminate this note's
// vote. A long future-looking window was able to assign the *next* pitch to
// a harmless ripple that occurred just before it.
const PITCH_WINDOW_SEC = 0.14;
const PITCH_MIN_ESTIMATES = 3;
const PITCH_MAX_ESTIMATES = 10;
const MAX_PITCH_SPREAD_SEMITONES = 0.8;
const MAX_PITCH_MAD_SEMITONES = 0.38;
const MIN_PITCH_CONSENSUS = 0.5;
const MIN_REPORTED_CLARITY = 0.25;

/* Harmonic-shadow quarantine.
 *
 * A ringing piano fundamental naturally contains energy at octaves, fifths,
 * and higher partials. If one of those partials briefly wins the pitch vote,
 * it must never become an unconditional new key. We do not delete it: a real
 * score may genuinely ask for that key while the lower string still rings.
 * Instead, it is downgraded to the contextual lane unless an independent
 * hammer attack is visible in the broadband onset features. */
const HARMONIC_SHADOW_INTERVALS = new Set([7, 12, 19, 24, 28, 31, 34, 36]);
const HARMONIC_PARENT_MAX_AGE_SEC = 6;

/* Borderline recovery lane.
 *
 * These values do NOT declare a note correct or wrong. They preserve a
 * physically plausible but low-confidence strike so the main thread can
 * compare it with the note currently expected by the exercise. An event in
 * this lane is discarded unless it exactly matches an expected pitch near
 * its written time. This separation improves quiet-note recall without
 * allowing uncertain room sound to become a wrong-note penalty. */
const RECOVERY_MIN_ESTIMATES = 2;
const RECOVERY_MIN_CONSENSUS = 0.42;
const RECOVERY_MAX_SPREAD_SEMITONES = 1.2;
const RECOVERY_MAX_MAD_SEMITONES = 0.72;
const RECOVERY_MIN_CLARITY = 0.16;
const RECOVERY_GATE_FRACTION = 0.52;
const RECOVERY_FRAME_ATTACK_RATIO = 1.035;
const RECOVERY_ATTACK_NOVELTY = 0.14;
const RECOVERY_LEGATO_FRAME_RATIO = 0.94;
const RECOVERY_LEGATO_NOVELTY = 0.29;

/* Broadband/percussive rejection.
 *
 * The app's woodblock click has an intentionally sharp, spectrally novel
 * attack. At realistic speaker-to-microphone leakage it can still produce a
 * short YIN period, but that "pitch" does not remain coherent across the
 * post-attack vote window. A real acoustic-piano strike can also have very
 * high onset novelty—especially in the upper register—so novelty alone is
 * not a safe veto. Reject only the conjunction measured in the real-piano
 * corpus: an exceptionally broadband attack whose final multi-frame pitch
 * evidence remains weak. Quiet piano events keep the recovery lane; click
 * transients never become contextual candidates that could fill a written
 * note by accident. */
const PERCUSSIVE_NOVELTY_FLOOR = 0.82;
const PERCUSSIVE_MAX_PITCH_CLARITY = 0.88;
/** The microphone receives a scheduled click slightly after speaker output. */
const REFERENCE_TRANSIENT_BEFORE_SEC = 0.035;
const REFERENCE_TRANSIENT_AFTER_SEC = 0.14;

/* Piano / voice separation.
 *
 * YIN intentionally works on both speech and music, so clarity alone is not
 * an instrument classifier. Recognition therefore uses a conjunction:
 *   1. the frequency must sit near the equal-tempered piano grid;
 *   2. it must remain stiff over several independent pitch frames; and
 *   3. the onset must contain a multi-band hammer-like spectral change.
 * A single feature is never a hard veto because a quiet piano can have a
 * gentle attack and a spoken plosive can be broadband. */
const STRICT_MAX_TUNING_ERROR_CENTS = 44;
const STRICT_MAX_PITCH_RANGE_SEMITONES = 0.4;
const STRICT_MAX_PITCH_STEP_SEMITONES = 0.27;
const RECOVERY_MAX_TUNING_ERROR_CENTS = 32;
const RECOVERY_MAX_PITCH_RANGE_SEMITONES = 0.38;
const RECOVERY_MAX_PITCH_STEP_SEMITONES = 0.24;
/* A piano fundamental can drift a few cents during the first attack frames.
 * Do not classify that ordinary settling as voice merely because a short
 * least-squares slope is numerically steep. Voice vetoes use displacement
 * (range / adjacent-frame step); slope is supporting evidence only. */
const VOICE_DIRECT_RANGE_SEMITONES = 0.4;
const VOICE_DIRECT_STEP_SEMITONES = 0.34;
const VOICE_GLIDE_RANGE_SEMITONES = 0.82;
const VOICE_GLIDE_STEP_SEMITONES = 0.48;
const VOICE_GLIDE_RATE_SEMITONES_PER_SEC = 3.8;
const ATTACK_BANDS_HZ = [90, 180, 360, 720, 1440, 2880, 5760, 8000];
const MIN_PIANO_ATTACK_BANDS = 2;
const STRICT_MIN_PIANO_ATTACK_CONFIDENCE = 0.52;

/* Acoustic key-release tracking. A held piano tone decays smoothly; a
 * damper/key release produces a much steeper multi-frame energy collapse.
 * Pedal can keep the string alive after key-up, so no release is fabricated
 * when the collapse is not acoustically observable. */
const RELEASE_MIN_AGE_SEC = 0.14;
const RELEASE_CONFIRM_FRAMES = 3;
const RELEASE_FAST_SMOOTH_RATIO = 0.42;
const RELEASE_SLOW_SMOOTH_RATIO = 0.9;
const RELEASE_MAX_TRACK_SEC = 8;
const RELEASE_OVERLAP_SETTLE_SEC = 0.16;
const RELEASE_PROFILE_BANDS = 6;

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
 * C#6 is the curriculum ceiling (1109Hz); this leaves headroom above it
 * without opening the range to shrill artefacts.
 */
const MAX_FREQ = 1250;
const MIN_CLARITY = 0.38;

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
const POST_ONSET_DECAY = 0.86;
/** Never let an uninitialised near-zero median mute the next several notes. */
const POST_ONSET_MAX_MULT = 3.25;

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

/** Build an independent, robust pitch vote for one estimator family. */
function pitchHypothesis(estimates, source) {
  if (!estimates || estimates.length < RECOVERY_MIN_ESTIMATES) return null;
  const candidates = estimates
    .filter((estimate) => Number.isFinite(estimate.frequency) && estimate.frequency > 0)
    .map((estimate) => ({
      estimate,
      midi: 69 + 12 * Math.log2(estimate.frequency / 440),
    }));
  if (candidates.length < RECOVERY_MIN_ESTIMATES) return null;

  const counts = new Map();
  for (const candidate of candidates) {
    const key = Math.round(candidate.midi);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const globalMidi = median(candidates.map((candidate) => candidate.midi), candidates.length);
  const key = [...counts.keys()].sort((a, b) =>
    counts.get(b) - counts.get(a) || Math.abs(a - globalMidi) - Math.abs(b - globalMidi)
  )[0];
  const cluster = candidates.filter((candidate) => Math.round(candidate.midi) === key);
  const clusterMidi = median(cluster.map((candidate) => candidate.midi), cluster.length);
  const stable = cluster.filter(
    (candidate) => Math.abs(candidate.midi - clusterMidi) <= RECOVERY_MAX_SPREAD_SEMITONES,
  );
  if (stable.length < RECOVERY_MIN_ESTIMATES) return null;
  const stableMidi = median(stable.map((candidate) => candidate.midi), stable.length);
  const pitchMad = median(
    stable.map((candidate) => Math.abs(candidate.midi - stableMidi)),
    stable.length,
  );
  const clarity = median(stable.map((candidate) => candidate.estimate.clarity), stable.length);
  const trajectory = stable.map((candidate) => candidate.midi);
  const pitchRange = Math.max(...trajectory) - Math.min(...trajectory);
  let maxPitchStep = 0;
  for (let index = 1; index < trajectory.length; index++) {
    maxPitchStep = Math.max(maxPitchStep, Math.abs(trajectory[index] - trajectory[index - 1]));
  }
  const pitchDrift = trajectory.length > 1
    ? trajectory[trajectory.length - 1] - trajectory[0]
    : 0;
  const trajectorySeconds = Math.max(HOP / sampleRate, (trajectory.length - 1) * HOP / sampleRate);
  const pitchSlope = pitchDrift / trajectorySeconds;
  const tuningErrorCents = Math.abs(stableMidi - Math.round(stableMidi)) * 100;
  return {
    source,
    midi: Math.round(stableMidi),
    frequency: 440 * Math.pow(2, (stableMidi - 69) / 12),
    frames: stable.length,
    consensus: cluster.length / candidates.length,
    clarity,
    pitchMad,
    tuningErrorCents,
    pitchRange,
    maxPitchStep,
    pitchSlope,
  };
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
    this.novelty1 = 0;
    this.attackBandCoverage1 = 0;
    this.attackHighRatio1 = 0;
    this.spectralFlatness1 = 0;

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
    this.lastCandidateTime = -Infinity;
    this.armed = true;
    this.postOnset = 0;
    this.pending = [];
    this.activeNotes = [];
    this.referenceTransients = [];
    this.voiceActivityFrom = Infinity;
    this.voiceActivityUntil = -Infinity;
    // Prove It supplies exactly one next pitch at a time. This does not grant
    // acceptance; it only opens a quieter physical-onset lane whose result is
    // still verified against independent pitch evidence on the main thread.
    this.watchedMidi = null;
    this.nextOnsetId = 1;
    this.levelCounter = 0;
    this.listening = false;
    this.debug = false;
    this.hopSeconds = HOP / sampleRate;
    this.capture = null;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'debug') {
        this.debug = Boolean(data.enabled);
      } else if (data.type === 'listen') {
        this.listening = true;
        this.lastOnsetTime = -Infinity;
        this.lastCandidateTime = -Infinity;
        this.armed = true;
        this.postOnset = 0;
        this.envelopeTrough = Math.max(1e-5, this.noiseCeiling);
        this.pending = [];
        this.activeNotes = [];
        this.voiceActivityFrom = Infinity;
        this.voiceActivityUntil = -Infinity;
        this.watchedMidi = null;
        // Keep the continuously learned phase history. Clearing it here
        // makes ordinary room tone look like a sudden complex-domain attack
        // on the first listening frame and can manufacture a phantom note.
      } else if (data.type === 'idle') {
        this.listening = false;
        this.flushPending(true);
        this.activeNotes = [];
        this.referenceTransients = [];
        this.voiceActivityFrom = Infinity;
        this.voiceActivityUntil = -Infinity;
        this.watchedMidi = null;
      } else if (data.type === 'watch-pitch') {
        const midi = Number(data.midi);
        this.watchedMidi = Number.isFinite(midi) && midi >= 21 && midi <= 108
          ? Math.round(midi)
          : null;
      } else if (data.type === 'clear-watch-pitch') {
        this.watchedMidi = null;
      } else if (data.type === 'reference-transients') {
        const times = Array.isArray(data.times) ? data.times : [];
        this.referenceTransients = times
          .map(Number)
          .filter(Number.isFinite)
          .sort((a, b) => a - b);
      } else if (data.type === 'accept-candidate') {
        const id = Number(data.id);
        const frequency = Number(data.frequency);
        const time = Number(data.time);
        if (
          this.listening &&
          Number.isFinite(id) &&
          Number.isFinite(frequency) &&
          frequency >= this.minFreq &&
          frequency <= this.maxFreq &&
          Number.isFinite(time)
        ) {
          this._startReleaseTracking(id, frequency, time);
        }
      } else if (data.type === 'cancel-note') {
        const id = Number(data.id);
        if (Number.isFinite(id)) {
          this.activeNotes = this.activeNotes.filter((note) => note.id !== id);
        }
      } else if (data.type === 'retarget-note') {
        const id = Number(data.id);
        const frequency = Number(data.frequency);
        const active = this.activeNotes.find((note) => note.id === id);
        if (
          active &&
          Number.isFinite(frequency) &&
          frequency >= this.minFreq &&
          frequency <= this.maxFreq
        ) {
          active.frequency = frequency;
          active.midi = Math.round(69 + 12 * Math.log2(frequency / 440));
          const profile = this._harmonicProfile(frequency);
          const energy = Math.max(
            1e-9,
            profile.reduce((sum, bandEnergy) => sum + bandEnergy, 0),
          );
          active.peakEnergy = energy;
          active.fastEnergy = energy;
          active.slowEnergy = energy;
          active.previousFastEnergy = energy;
          active.releaseFrames = 0;
          active.collapseStartedAt = null;
          active.minSmoothRatio = 1;
          active.peakBandEnergy.set(profile);
          active.fastBandEnergy.set(profile);
          active.slowBandEnergy.set(profile);
          active.previousFastBandEnergy.set(profile);
          active.currentBandEnergy.fill(0);
          active.lastOverlapAt = null;
        }
      } else if (data.type === 'capture-plan') {
        const id = Number(data.id);
        const startTime = Number(data.startTime);
        const endTime = Number(data.endTime);
        if (
          Number.isFinite(id) &&
          Number.isFinite(startTime) &&
          Number.isFinite(endTime) &&
          endTime > startTime
        ) {
          // Complete/cancel any stale plan before replacing it. A new drill
          // must never append PCM to the previous drill's take.
          this._finishCapture(false);
          this.capture = {
            id,
            requestedStartTime: startTime,
            endTime,
            actualStartTime: null,
            actualEndTime: null,
            buffer: new Float32Array(CAPTURE_CHUNK_SAMPLES),
            write: 0,
          };
        }
      } else if (data.type === 'capture-cancel') {
        const id = Number(data.id);
        if (this.capture && (!Number.isFinite(id) || this.capture.id === id)) {
          this._finishCapture(false);
        }
      }
    };
  }

  _flushCaptureChunk() {
    const capture = this.capture;
    if (!capture || capture.write === 0) return;
    const chunk = capture.buffer.slice(0, capture.write);
    capture.write = 0;
    this.port.postMessage(
      { type: 'capture-chunk', id: capture.id, samples: chunk.buffer },
      [chunk.buffer],
    );
  }

  _finishCapture(complete) {
    const capture = this.capture;
    if (!capture) return;
    if (complete) this._flushCaptureChunk();
    this.capture = null;
    if (!complete) return;
    this.port.postMessage({
      type: 'capture-complete',
      id: capture.id,
      sampleRate,
      startTime: capture.actualStartTime ?? capture.requestedStartTime,
      endTime: capture.actualEndTime ?? capture.endTime,
    });
  }

  _captureChannel(channel) {
    const capture = this.capture;
    if (!capture) return;
    const blockStartTime = currentTime;
    for (let index = 0; index < channel.length; index++) {
      const time = blockStartTime + index / sampleRate;
      if (time < capture.requestedStartTime) continue;
      if (time >= capture.endTime) {
        capture.actualEndTime = time;
        this._finishCapture(true);
        return;
      }
      if (capture.actualStartTime === null) capture.actualStartTime = time;
      capture.buffer[capture.write++] = channel[index];
      if (capture.write === capture.buffer.length) this._flushCaptureChunk();
    }
  }

  _debug(type, data) {
    if (this.debug) this.port.postMessage({ type: `debug-${type}`, ...data });
  }

  _rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  _harmonicProfile(frequency, out = new Float32Array(RELEASE_PROFILE_BANDS)) {
    out.fill(0);
    const binHz = sampleRate / FFT_SIZE;
    for (let harmonic = 1; harmonic <= RELEASE_PROFILE_BANDS; harmonic++) {
      const target = frequency * harmonic;
      if (target >= FLUX_MAX_BAND_HZ) break;
      const x = target / binHz;
      const index = Math.floor(x);
      if (index < 1 || index + 2 >= this.mag.length) continue;
      const fraction = x - index;
      const center = this.mag[index] * (1 - fraction) + this.mag[index + 1] * fraction;
      const shoulders = (this.mag[index - 1] + this.mag[index + 2]) * 0.12;
      out[harmonic - 1] = (center + shoulders) / Math.sqrt(harmonic);
    }
    return out;
  }

  _markReleaseOverlap(onsetTime) {
    for (const active of this.activeNotes) {
      active.overlapped = true;
      active.lastOverlapAt = onsetTime;
      active.releaseFrames = 0;
      active.collapseStartedAt = null;
      active.minSmoothRatio = 1;
    }
  }

  _emitRelease(note, time, confidence, reason) {
    const effectiveConfidence = reason === 'energy-drop' && note.overlapped
      ? confidence * 0.82
      : confidence;
    this.port.postMessage({
      type: 'note-release',
      id: note.id,
      time,
      confidence: Math.min(1, Math.max(0, effectiveConfidence)),
      reason,
    });
  }

  _startReleaseTracking(id, frequency, onsetTime) {
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const beganOverExistingTone = this.activeNotes.length > 0;
    this._markReleaseOverlap(onsetTime);
    // A clear re-articulation of the same key proves the earlier hold ended,
    // even if pedal resonance prevented an amplitude release from appearing.
    for (let index = this.activeNotes.length - 1; index >= 0; index--) {
      const active = this.activeNotes[index];
      if (active.midi !== midi) continue;
      this._emitRelease(active, onsetTime, 0.72, 'reattack');
      this.activeNotes.splice(index, 1);
    }

    const profile = this._harmonicProfile(frequency);
    const peakBandEnergy = Float32Array.from(profile, (energy) => Math.max(1e-9, energy));
    const energy = peakBandEnergy.reduce((sum, bandEnergy) => sum + bandEnergy, 0);
    this.activeNotes.push({
      id,
      midi,
      frequency,
      time: onsetTime,
      peakEnergy: energy,
      fastEnergy: energy,
      slowEnergy: energy,
      previousFastEnergy: energy,
      releaseFrames: 0,
      collapseStartedAt: null,
      minSmoothRatio: 1,
      overlapped: beganOverExistingTone,
      lastOverlapAt: null,
      peakBandEnergy,
      fastBandEnergy: peakBandEnergy.slice(),
      slowBandEnergy: peakBandEnergy.slice(),
      previousFastBandEnergy: peakBandEnergy.slice(),
      currentBandEnergy: new Float32Array(RELEASE_PROFILE_BANDS),
    });
  }

  _trackReleases() {
    if (!this.listening || this.activeNotes.length === 0) return;
    for (let index = this.activeNotes.length - 1; index >= 0; index--) {
      const note = this.activeNotes[index];
      const age = currentTime - note.time;
      if (age > RELEASE_MAX_TRACK_SEC) {
        this.activeNotes.splice(index, 1);
        continue;
      }

      // Reuse the note-owned buffer: release tracking runs every FFT hop and
      // must not allocate on the real-time audio thread.
      this._harmonicProfile(note.frequency, note.currentBandEnergy);
      let energy = 0;
      for (let band = 0; band < RELEASE_PROFILE_BANDS; band++) {
        energy += note.currentBandEnergy[band];
      }
      const previousFast = Math.max(1e-9, note.fastEnergy);
      note.previousFastEnergy = previousFast;
      note.fastEnergy =
        previousFast * RELEASE_FAST_SMOOTH_RATIO +
        energy * (1 - RELEASE_FAST_SMOOTH_RATIO);
      note.slowEnergy =
        Math.max(1e-9, note.slowEnergy) * RELEASE_SLOW_SMOOTH_RATIO +
        energy * (1 - RELEASE_SLOW_SMOOTH_RATIO);
      note.peakEnergy = Math.max(note.peakEnergy, note.fastEnergy);
      const smoothRatio = note.fastEnergy / previousFast;
      const fastToSlow = note.fastEnergy / Math.max(1e-9, note.slowEnergy);
      const relativeEnergy = note.fastEnergy / Math.max(1e-9, note.peakEnergy);
      note.minSmoothRatio = Math.min(note.minSmoothRatio, smoothRatio);

      if (age < RELEASE_MIN_AGE_SEC) continue;
      if (
        Number.isFinite(note.lastOverlapAt) &&
        currentTime - note.lastOverlapAt < RELEASE_OVERLAP_SETTLE_SEC
      ) {
        note.releaseFrames = 0;
        note.collapseStartedAt = null;
        continue;
      }

      // A chord can keep the total energy near this pitch high even after one
      // key is released. Track each harmonic band independently so unrelated
      // chord partials cannot hide a real key-up—or make one beating partial
      // look like the whole note disappeared.
      let strongestBand = 1e-9;
      for (let band = 0; band < RELEASE_PROFILE_BANDS; band++) {
        const previous = Math.max(1e-9, note.fastBandEnergy[band]);
        const bandEnergy = note.currentBandEnergy[band];
        note.previousFastBandEnergy[band] = previous;
        note.fastBandEnergy[band] =
          previous * RELEASE_FAST_SMOOTH_RATIO +
          bandEnergy * (1 - RELEASE_FAST_SMOOTH_RATIO);
        note.slowBandEnergy[band] =
          Math.max(1e-9, note.slowBandEnergy[band]) * RELEASE_SLOW_SMOOTH_RATIO +
          bandEnergy * (1 - RELEASE_SLOW_SMOOTH_RATIO);
        note.peakBandEnergy[band] = Math.max(
          note.peakBandEnergy[band],
          note.fastBandEnergy[band],
        );
        strongestBand = Math.max(strongestBand, note.peakBandEnergy[band]);
      }
      let reliableBands = 0;
      let collapsedBands = 0;
      let nearlyGoneBands = 0;
      let deepestBandDrop = 1;
      for (let band = 0; band < RELEASE_PROFILE_BANDS; band++) {
        const peak = note.peakBandEnergy[band];
        if (peak < strongestBand * 0.035) continue;
        reliableBands += 1;
        const bandFast = note.fastBandEnergy[band];
        const bandSmooth = bandFast / Math.max(1e-9, note.previousFastBandEnergy[band]);
        const bandFastToSlow = bandFast / Math.max(1e-9, note.slowBandEnergy[band]);
        const bandRelative = bandFast / Math.max(1e-9, peak);
        deepestBandDrop = Math.min(deepestBandDrop, bandSmooth);
        if (bandSmooth < 0.86 && bandFastToSlow < 0.74 && bandRelative < 0.8) {
          collapsedBands += 1;
        }
        if (bandSmooth < 0.92 && bandFastToSlow < 0.64 && bandRelative < 0.025) {
          nearlyGoneBands += 1;
        }
      }
      // Treble partials decay quickly even while the key remains down. A
      // single upper band disappearing is therefore not a trustworthy key-up;
      // require corroboration from two bands in the B4-and-above register.
      const requiredCollapsedBands = Math.max(
        note.midi >= 71 ? 2 : 1,
        Math.ceil(reliableBands * 0.2),
      );
      if (this.debug) {
        this._debug('release-profile', {
          id: note.id,
          midi: note.midi,
          time: currentTime,
          reliableBands,
          collapsedBands,
          nearlyGoneBands,
          requiredCollapsedBands,
          smoothRatio,
          fastToSlow,
          relativeEnergy,
        });
      }
      // Compare a fast envelope with a slow estimate of the natural decay.
      // Ordinary sustain makes both envelopes fall together. A damper close
      // pulls the fast envelope sharply below the slow one and also produces
      // a steep local drop. Requiring both rejects beating partials and room
      // fluctuations while retaining the actual acoustic offset edge.
      const collapsed =
        reliableBands >= 2 &&
        collapsedBands >= requiredCollapsedBands;
      const nearlyGone =
        reliableBands >= 2 &&
        nearlyGoneBands >= requiredCollapsedBands;
      if (collapsed || nearlyGone) {
        if (note.releaseFrames === 0) {
          // The FFT frame is centred roughly half a frame before currentTime.
          note.collapseStartedAt = currentTime - FFT_SIZE / (2 * sampleRate);
        }
        note.releaseFrames += 1;
      } else {
        note.releaseFrames = Math.max(0, note.releaseFrames - 1);
        if (note.releaseFrames === 0) note.collapseStartedAt = null;
      }

      if (note.releaseFrames < RELEASE_CONFIRM_FRAMES) continue;
      const releaseTime = Math.max(
        note.time + RELEASE_MIN_AGE_SEC,
        note.collapseStartedAt ?? currentTime - FFT_SIZE / (2 * sampleRate),
      );
      const confidence =
        0.48 +
        Math.min(
          0.27,
          Math.max(0, (1 - Math.min(note.minSmoothRatio, deepestBandDrop)) * 1.35),
        ) +
        Math.min(0.15, Math.max(0, (0.75 - fastToSlow) * 0.9)) +
        Math.min(0.1, Math.max(0, (0.65 - relativeEnergy) * 0.55));
      this._emitRelease(note, releaseTime, confidence, 'energy-drop');
      this.activeNotes.splice(index, 1);
    }
  }

  /**
   * `size` samples ending `samplesAgo` before the newest ring sample.
   * Keeping the offset explicit is important: the pre-onset spectrum must
   * not accidentally include the hammer transient it is meant to subtract.
   */
  _read(size, out, samplesAgo = 0) {
    const safeOffset = Math.max(0, Math.min(RING - size, samplesAgo));
    const start = (this.writePos - safeOffset - size + RING * 2) % RING;
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
  _spectrum(out, samplesAgo = 0) {
    const buf = this._read(PITCH_FFT, this.pitchRe, samplesAgo);
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
    const harmonicScore = (f0, stretch = 0) => {
      let sum = 0;
      for (let k = 1; k <= 8; k++) {
        // Piano-string stiffness pulls upper partials progressively sharp.
        // Keep the fundamental fixed and test a small bank of coherent
        // stretch profiles instead of widening every harmonic independently,
        // which would make broadband noise look pitched.
        const f = f0 * k * (1 + stretch * (k * k - 1));
        if (f > sampleRate / 2) break;
        sum += at(f) / Math.sqrt(k);
      }
      return sum;
    };
    const score = (f0) => {
      if (f0 < UPPER_REGISTER_MIN_FREQ) return harmonicScore(f0);
      let best = 0;
      for (const stretch of UPPER_INHARMONICITY_BANK) {
        best = Math.max(best, harmonicScore(f0, stretch));
      }
      return best;
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
      const hypotheses = [
        pitchHypothesis(item.yinEstimates, 'yin'),
        pitchHypothesis(item.emergentEstimates, 'emergent'),
      ].filter(Boolean);
      const fallback = [...hypotheses].sort((a, b) =>
        b.frames * b.consensus * b.clarity - a.frames * a.consensus * a.clarity
      )[0];
      const pianoAttackConfidence = Math.min(1,
        Math.min(1, item.attackBandCoverage / 4) * 0.34 +
        Math.min(1, item.novelty / 0.42) * 0.28 +
        Math.min(1, Math.max(0, item.frameAttackRatio - 0.92) / 0.28) * 0.23 +
        Math.min(1, item.attackHighRatio / 0.18) * 0.15
      );
      const harmonicIndependentAttack = Boolean(
        pianoAttackConfidence >= 0.5 &&
        item.attackBandCoverage >= 2 &&
        (
          (item.frameAttackRatio >= 1.015 && item.novelty >= 0.16) ||
          (item.frameAttackRatio >= 0.97 && item.novelty >= 0.33)
        )
      );
      const harmonicParentFor = (midi) => this.activeNotes.find((active) => {
        const interval = Math.round(midi) - active.midi;
        const age = item.time - active.time;
        return (
          age >= 0 &&
          age <= HARMONIC_PARENT_MAX_AGE_SEC &&
          HARMONIC_SHADOW_INTERVALS.has(interval)
        );
      }) ?? null;
      const voiceEvidenceFor = (hypothesis) => {
        if (!hypothesis) return { speechLike: false, voiceVeto: false };
        const pitchGlide =
          hypothesis.pitchRange >= VOICE_GLIDE_RANGE_SEMITONES ||
          hypothesis.maxPitchStep >= VOICE_GLIDE_STEP_SEMITONES ||
          Math.abs(hypothesis.pitchSlope) >= VOICE_GLIDE_RATE_SEMITONES_PER_SEC;
        const extremeGlide =
          hypothesis.pitchRange >= 1.35 ||
          hypothesis.maxPitchStep >= 0.82 ||
          Math.abs(hypothesis.pitchSlope) >= 7.5;
        const directVoiceMotion =
          hypothesis.pitchRange > VOICE_DIRECT_RANGE_SEMITONES ||
          hypothesis.maxPitchStep > VOICE_DIRECT_STEP_SEMITONES;
        const weakHammer =
          item.attackBandCoverage < MIN_PIANO_ATTACK_BANDS ||
          pianoAttackConfidence < 0.46;
        return {
          speechLike: pitchGlide || weakHammer,
          // These limits sit above every strict event in the acoustic-piano
          // corpus, while speech repeatedly crosses them within one syllable.
          voiceVeto: extremeGlide || directVoiceMotion || (pitchGlide && weakHammer),
        };
      };
      const withVoiceBurst = (hypothesis, evidence) => {
        /* Report whether speech activity was already established before this
         * onset.  The former implementation extended the burst first and
         * then labelled the cue itself as `voiceBurst`; that erased the
         * distinction between continuous speech and a quiet piano onset
         * whose YIN octave estimate briefly glided during a reference click. */
        const voiceBurst =
          item.time >= this.voiceActivityFrom && item.time <= this.voiceActivityUntil;
        const reliableVoiceCue = Boolean(
          evidence.voiceVeto &&
          !item.referenceTransient &&
          hypothesis &&
          hypothesis.frames >= 4 &&
          hypothesis.clarity >= 0.55
        );
        if (reliableVoiceCue) {
          this.voiceActivityFrom = Math.min(this.voiceActivityFrom, item.time - 0.3);
          this.voiceActivityUntil = Math.max(this.voiceActivityUntil, item.time + 0.9);
        }
        return {
          speechLike: evidence.speechLike || voiceBurst,
          voiceVeto: evidence.voiceVeto || voiceBurst,
          voiceBurst,
        };
      };
      const emitContextCandidate = (reason) => {
        if (!fallback) return false;
        const voiceEvidence = withVoiceBurst(fallback, voiceEvidenceFor(fallback));
        const harmonicParent = harmonicParentFor(fallback.midi);
        this.port.postMessage({
          type: 'note-candidate',
          id: item.id,
          frequency: fallback.frequency,
          clarity: fallback.clarity,
          strength: item.strength,
          sustain: item.sustain,
          peakRms: item.peakRms,
          gate: item.gate,
          attackRatio: item.attackRatio,
          frameAttackRatio: item.frameAttackRatio,
          novelty: item.novelty,
          time: item.time,
          frames: item.estimates.length,
          stableFrames: fallback.frames,
          consensus: fallback.consensus,
          pitchMad: fallback.pitchMad,
          tuningErrorCents: fallback.tuningErrorCents,
          pitchRange: fallback.pitchRange,
          maxPitchStep: fallback.maxPitchStep,
          pitchSlope: fallback.pitchSlope,
          pianoAttackConfidence,
          attackBandCoverage: item.attackBandCoverage,
          attackHighRatio: item.attackHighRatio,
          spectralFlatness: item.spectralFlatness,
          speechLike: voiceEvidence.speechLike,
          voiceVeto: voiceEvidence.voiceVeto,
          voiceBurst: voiceEvidence.voiceBurst,
          hypotheses,
          referenceTransient: Boolean(item.referenceTransient),
          strongPianoDuringReference: false,
          harmonicShadow: Boolean(harmonicParent),
          harmonicParentMidi: harmonicParent?.midi ?? null,
          harmonicIndependentAttack,
          recoveryReason: item.referenceTransient
            ? 'reference-transient'
            : harmonicParent && !harmonicIndependentAttack
              ? 'harmonic-shadow'
              : reason,
        });
        return true;
      };
      if (item.estimates.length < RECOVERY_MIN_ESTIMATES) {
        if (emitContextCandidate('estimator-disagreement')) continue;
        this.port.postMessage({
          type: 'note-rejected',
          reason: 'too-few-estimates',
          time: item.time,
          frames: item.estimates.length,
        });
        this._debug('pitch-rejected', { reason: 'too-few-estimates', time: item.time, estimates: item.estimates.length });
        continue;
      }

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
      if (dominant.length < RECOVERY_MIN_ESTIMATES || consensus < RECOVERY_MIN_CONSENSUS) {
        if (emitContextCandidate('low-consensus')) continue;
        this.port.postMessage({
          type: 'note-rejected',
          reason: 'consensus',
          time: item.time,
          frames: item.estimates.length,
          consensus,
        });
        this._debug('pitch-rejected', { reason: 'consensus', time: item.time, estimates: item.estimates.length, consensus });
        continue;
      }

      const dominantMidi = median(dominant.map((candidate) => candidate.midi), dominant.length);
      const stable = dominant.filter(
        (candidate) => Math.abs(candidate.midi - dominantMidi) <= RECOVERY_MAX_SPREAD_SEMITONES,
      );
      if (stable.length < RECOVERY_MIN_ESTIMATES) {
        if (emitContextCandidate('wide-spread')) continue;
        this.port.postMessage({
          type: 'note-rejected',
          reason: 'spread',
          time: item.time,
          frames: item.estimates.length,
          stableFrames: stable.length,
        });
        this._debug('pitch-rejected', { reason: 'spread', time: item.time, stable: stable.length });
        continue;
      }

      const stableMidis = stable.map((candidate) => candidate.midi);
      const stableMidi = median(stableMidis, stableMidis.length);
      const pitchMad = median(
        stableMidis.map((midi) => Math.abs(midi - stableMidi)),
        stableMidis.length,
      );
      if (pitchMad > RECOVERY_MAX_MAD_SEMITONES) {
        if (emitContextCandidate('pitch-variance')) continue;
        this.port.postMessage({
          type: 'note-rejected',
          reason: 'mad',
          time: item.time,
          frames: item.estimates.length,
          pitchMad,
        });
        this._debug('pitch-rejected', { reason: 'mad', time: item.time, pitchMad });
        continue;
      }

      const clarity = median(
        stable.map((candidate) => candidate.estimate.clarity),
        stable.length,
      );
      if (clarity < RECOVERY_MIN_CLARITY) {
        if (emitContextCandidate('low-clarity')) continue;
        this.port.postMessage({
          type: 'note-rejected',
          reason: 'clarity',
          time: item.time,
          frames: item.estimates.length,
          clarity,
        });
        this._debug('pitch-rejected', { reason: 'clarity', time: item.time, clarity });
        continue;
      }

      const percussiveOnly =
        item.novelty >= PERCUSSIVE_NOVELTY_FLOOR &&
        clarity < PERCUSSIVE_MAX_PITCH_CLARITY;
      if (percussiveOnly) {
        // Preserve this only as contextual evidence. The main thread may use
        // an exact score match to rescue a piano attack buried under a click,
        // but this event can never become an unconditional wrong note.
        this._debug('pitch-rejected', {
          reason: 'percussive-transient',
          time: item.time,
          clarity,
          novelty: item.novelty,
        });
      }

      const strictStable = dominant.filter(
        (candidate) => Math.abs(candidate.midi - dominantMidi) <= MAX_PITCH_SPREAD_SEMITONES,
      );
      const strictMidi = strictStable.length > 0
        ? median(strictStable.map((candidate) => candidate.midi), strictStable.length)
        : stableMidi;
      const strictMad = strictStable.length > 0
        ? median(
            strictStable.map((candidate) => Math.abs(candidate.midi - strictMidi)),
            strictStable.length,
          )
        : Infinity;
      const yinHypothesis = hypotheses.find((hypothesis) => hypothesis.source === 'yin');
      const emergentHypothesis = hypotheses.find((hypothesis) => hypothesis.source === 'emergent');
      /* A click or other short broadband transient landing over a ringing
       * piano note creates a characteristic estimator conflict: YIN sees the
       * coherent sustained string, while the residual-spectrum estimator
       * invents a weak, unrelated "new pitch" from the transient. Treat that
       * as contextual evidence, never as a strict wrong note. If the score is
       * genuinely asking for a re-strike or a new note at this instant, the
       * main thread can still recover the matching independent hypothesis. */
      const transientConflict = Boolean(
        yinHypothesis &&
        emergentHypothesis &&
        Math.abs(yinHypothesis.midi - emergentHypothesis.midi) >= 3 &&
        yinHypothesis.frames >= 4 &&
        yinHypothesis.consensus >= 0.72 &&
        yinHypothesis.clarity >= 0.68 &&
        (
          emergentHypothesis.frames < 4 ||
          emergentHypothesis.consensus < 0.62 ||
          emergentHypothesis.clarity < 0.62
        )
      );
      /* A low-confidence residual-spectrum estimate with no matching YIN
       * trace is useful as contextual recovery evidence, but it is not safe
       * enough to become an unconditional note. This is the signature left
       * by a metronome click tail after its broadband onset has decayed. A
       * quiet recorded piano attack still supplies a coherent YIN hypothesis,
       * so this does not raise the soft-note threshold. */
      const weakEmergentOnly = Boolean(
        !yinHypothesis &&
        emergentHypothesis &&
        emergentHypothesis.clarity < 0.62
      );
      const strongPianoDuringReference = Boolean(
        yinHypothesis &&
        yinHypothesis.frames >= 6 &&
        yinHypothesis.consensus >= 0.8 &&
        yinHypothesis.clarity >= 0.9 &&
        clarity >= 0.9
      );
      const selectedHypothesis = hypotheses
        .filter((hypothesis) => hypothesis.midi === Math.round(strictMidi))
        .sort((left, right) =>
          right.frames * right.consensus * right.clarity -
          left.frames * left.consensus * left.clarity
        )[0] ?? fallback;
      const selectedVoiceEvidence = withVoiceBurst(
        selectedHypothesis,
        voiceEvidenceFor(selectedHypothesis),
      );
      const tuningErrorCents = Math.abs(strictMidi - Math.round(strictMidi)) * 100;
      const strictTrajectoryOkay = Boolean(
        selectedHypothesis &&
        selectedHypothesis.pitchRange <= STRICT_MAX_PITCH_RANGE_SEMITONES &&
        selectedHypothesis.maxPitchStep <= STRICT_MAX_PITCH_STEP_SEMITONES
      );
      const strictHammerOkay =
        item.attackBandCoverage >= MIN_PIANO_ATTACK_BANDS &&
        pianoAttackConfidence >= STRICT_MIN_PIANO_ATTACK_CONFIDENCE;
      const strictHarmonicParent = harmonicParentFor(strictMidi);
      const strict =
        !transientConflict &&
        !weakEmergentOnly &&
        !percussiveOnly &&
        !selectedVoiceEvidence.voiceVeto &&
        tuningErrorCents <= STRICT_MAX_TUNING_ERROR_CENTS &&
        strictTrajectoryOkay &&
        strictHammerOkay &&
        (!strictHarmonicParent || harmonicIndependentAttack) &&
        (!item.referenceTransient || strongPianoDuringReference) &&
        !item.candidateOnly &&
        item.estimates.length >= PITCH_MIN_ESTIMATES &&
        dominant.length >= PITCH_MIN_ESTIMATES &&
        consensus >= MIN_PITCH_CONSENSUS &&
        strictStable.length >= PITCH_MIN_ESTIMATES &&
        strictMad <= MAX_PITCH_MAD_SEMITONES &&
        clarity >= MIN_REPORTED_CLARITY;
      const reportedMidi = transientConflict
        ? yinHypothesis.midi
        : strict
          ? strictMidi
          : stableMidi;
      const frequency = 440 * Math.pow(2, (reportedMidi - 69) / 12);

      if (strict) this._startReleaseTracking(item.id, frequency, item.time);
      this.port.postMessage({
        type: strict ? 'note-onset' : 'note-candidate',
        id: item.id,
        frequency,
        clarity,
        strength: item.strength,
        sustain: item.sustain,
        peakRms: item.peakRms,
        gate: item.gate,
        attackRatio: item.attackRatio,
        frameAttackRatio: item.frameAttackRatio,
        novelty: item.novelty,
        time: item.time,
        frames: item.estimates.length,
        stableFrames: stable.length,
        consensus,
        pitchMad,
        tuningErrorCents: strict
          ? tuningErrorCents
          : (selectedHypothesis?.tuningErrorCents ?? tuningErrorCents),
        pitchRange: selectedHypothesis?.pitchRange ?? Infinity,
        maxPitchStep: selectedHypothesis?.maxPitchStep ?? Infinity,
        pitchSlope: selectedHypothesis?.pitchSlope ?? Infinity,
        pianoAttackConfidence,
        attackBandCoverage: item.attackBandCoverage,
        attackHighRatio: item.attackHighRatio,
        spectralFlatness: item.spectralFlatness,
        speechLike: selectedVoiceEvidence.speechLike,
        voiceVeto: selectedVoiceEvidence.voiceVeto,
        voiceBurst: selectedVoiceEvidence.voiceBurst,
        hypotheses,
        referenceTransient: Boolean(item.referenceTransient),
        strongPianoDuringReference,
        harmonicShadow: Boolean(strictHarmonicParent),
        harmonicParentMidi: strictHarmonicParent?.midi ?? null,
        harmonicIndependentAttack,
        recoveryReason: item.referenceTransient && !strongPianoDuringReference
          ? 'reference-transient'
          : transientConflict
            ? 'transient-conflict'
            : percussiveOnly
              ? 'percussive-transient'
              : weakEmergentOnly
                ? 'emergent-only'
                : strictHarmonicParent && !harmonicIndependentAttack
                  ? 'harmonic-shadow'
                : item.candidateOnly
                  ? 'soft-attack'
                  : 'pitch-confidence',
      });
    }
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    // Capture before this worklet's pitch filtering or gating. The upstream
    // analysis-only browser front end removes rumble/hum and controls level,
    // but keeps every quiet key, click, voice, and decay so final scoring does
    // not inherit live-detector omissions.
    this._captureChannel(channel);

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
    this._trackReleases();

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
    let weightedEnergy = 0;
    let positiveFlux = 0;
    let highPositiveFlux = 0;
    let magnitudeSum = 0;
    let logMagnitudeSum = 0;
    let magnitudeCount = 0;
    const attackBandFlux = new Float32Array(ATTACK_BANDS_HZ.length - 1);
    for (let i = loBin; i <= hiBin; i++) {
      const w = this.hfWeight[i];
      weightedEnergy += w * this.mag[i];
      const magnitude = Math.max(1e-12, this.mag[i]);
      magnitudeSum += magnitude;
      logMagnitudeSum += Math.log(magnitude);
      magnitudeCount++;

      // Half-wave rectified, HF-weighted: only ENERGY APPEARING counts, and
      // treble counts for more. Steady tone in, steady tone out, flux near
      // zero however loud the room is — and a ringing string, having lost
      // its upper partials, contributes far less than a fresh strike.
      const d = this.mag[i] - this.prevMag[i];
      if (d > 0) {
        flux += w * d;
        positiveFlux += d;
        const frequency = i * binHz;
        if (frequency >= 1800) highPositiveFlux += d;
        for (let band = 0; band < attackBandFlux.length; band++) {
          if (frequency >= ATTACK_BANDS_HZ[band] && frequency < ATTACK_BANDS_HZ[band + 1]) {
            attackBandFlux[band] += d;
            break;
          }
        }
      }

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
    const novelty = flux / Math.max(weightedEnergy, 1e-9);
    let attackBandCoverage = 0;
    if (positiveFlux > 0) {
      for (const bandFlux of attackBandFlux) {
        if (bandFlux / positiveFlux >= 0.025) attackBandCoverage++;
      }
    }
    const attackHighRatio = highPositiveFlux / Math.max(positiveFlux, 1e-9);
    const spectralFlatness = magnitudeCount > 0 && magnitudeSum > 0
      ? Math.exp(logMagnitudeSum / magnitudeCount) / (magnitudeSum / magnitudeCount)
      : 0;
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
      const isLocalMaximum = this.odf1 > this.odf2 && this.odf1 >= odf;
      // A soft hammer strike can be a clean local maximum without clearing
      // the full room-independent multiplier. Preserve it for contextual
      // recovery, but never relax the post-onset guard that prevents one
      // sustained note from producing a second event.
      const recoveryThreshold = Math.max(baseThreshold * 0.68, this.postOnset);
      const isRecoveryPeak = isLocalMaximum && this.odf1 > recoveryThreshold;
      // A soft inner finger added over ringing outer notes can have a much
      // smaller broadband flux peak than the first key. Prove It names the
      // exact next pitch, so preserve a lower local maximum as a candidate.
      // It remains candidate-only and receives no credit unless stable pitch
      // evidence independently matches watchedMidi on the main thread.
      const upperRegisterProof = this.watchedMidi !== null && this.watchedMidi >= 71;
      const proofRecoveryThreshold = Math.max(
        baseThreshold * (upperRegisterProof ? 0.4 : 0.48),
        this.postOnset * (upperRegisterProof ? 0.56 : 0.72),
      );
      const isProofRecoveryPeak =
        this.watchedMidi !== null &&
        isLocalMaximum &&
        this.odf1 > proofRecoveryThreshold;

      const gate = this.amplitudeGate;
      const loudEnough = this.rms1 >= gate;
      // Compare the peak with the envelope trough since the previous strike,
      // not merely the immediately preceding hop. Real piano attacks build
      // over several hops, so frame-to-frame ratios can hide a true attack;
      // a trough-to-peak ratio captures the physical release/re-strike.
      const attackBase = Math.max(this.noiseCeiling, this.envelopeTrough, 1e-6);
      const attackRatio = this.rms1 / attackBase;
      const frameAttackRatio = this.rms1 / Math.max(this.rms2, this.noiseCeiling, 1e-6);
      // A new note must contain evidence of a physical articulation. The old
      // trough-only rule eventually gave every sustained tone an enormous
      // ratio, so harmless beating partials could become phantom notes.
      // Conventional attacks rise clearly in one hop. Softer legato attacks
      // can instead qualify through strong spectral novelty, but never while
      // the total envelope is visibly falling (a key release).
      const deliberateAttack =
        (frameAttackRatio >= MIN_FRAME_ATTACK_RATIO && this.novelty1 >= MIN_ATTACK_NOVELTY) ||
        (frameAttackRatio >= LEGATO_MIN_FRAME_RATIO && this.novelty1 >= STRONG_ATTACK_NOVELTY);
      const recoverableAttack =
        (frameAttackRatio >= RECOVERY_FRAME_ATTACK_RATIO && this.novelty1 >= RECOVERY_ATTACK_NOVELTY) ||
        (frameAttackRatio >= RECOVERY_LEGATO_FRAME_RATIO && this.novelty1 >= RECOVERY_LEGATO_NOVELTY);
      const recoverableLevel = this.rms1 >= gate * RECOVERY_GATE_FRACTION;
      const proofRecoverableAttack =
        (frameAttackRatio >= 1.015 && this.novelty1 >= 0.1) ||
        (frameAttackRatio >= 0.9 && this.novelty1 >= 0.22) ||
        (
          upperRegisterProof &&
          frameAttackRatio >= 0.985 &&
          this.novelty1 >= 0.13 &&
          this.attackBandCoverage1 >= 3 &&
          this.attackHighRatio1 >= 0.12
        );
      const proofRecoverableLevel = this.rms1 >= gate * 0.42;
      const onsetTime = currentTime - this.hopSeconds;
      // The app tells the worklet exactly when its own metronome will sound.
      // Keep coincident pitched evidence for score-aware recovery, but do not
      // let the click become an unconditional note.
      this.referenceTransients = this.referenceTransients.filter(
        (time) => time >= onsetTime - REFERENCE_TRANSIENT_AFTER_SEC,
      );
      const referenceTransient = this.referenceTransients.some(
        (time) =>
          onsetTime >= time - REFERENCE_TRANSIENT_BEFORE_SEC &&
          onsetTime <= time + REFERENCE_TRANSIENT_AFTER_SEC,
      );

      // Re-arm only once flux has fallen well below threshold. A decaying
      // piano note produces secondary flux bumps as partials beat against
      // each other; without this, one strike registers as several notes.
      if (!this.armed && this.odf1 < threshold * REARM_FRACTION) this.armed = true;

      if (this.debug && isLocalMaximum) {
        this._debug(isPeak ? 'peak' : 'subthreshold-peak', {
          time: onsetTime,
          armed: this.armed,
          loudEnough,
          deliberateAttack,
          rms: this.rms1,
          gate,
          attackRatio,
          frameAttackRatio,
          novelty: this.novelty1,
          attackBandCoverage: this.attackBandCoverage1,
          attackHighRatio: this.attackHighRatio1,
          spectralFlatness: this.spectralFlatness1,
          odf: this.odf1,
          threshold,
        });
      }

      const strictPhysicalAttack = isPeak && loudEnough && deliberateAttack;
      const recoveryPhysicalAttack =
        ((isPeak || isRecoveryPeak) && recoverableLevel && recoverableAttack) ||
        (isProofRecoveryPeak && proofRecoverableLevel && proofRecoverableAttack);
      /* A recovery-only peak is deliberately cheap enough to preserve a
       * very soft key for score-aware confirmation. It is therefore not
       * allowed to disarm the strict onset detector. Otherwise a harmless
       * decay ripple just before the next written note consumes the armed
       * state and the real hammer attack 40–100 ms later disappears. Strict
       * attacks retain the full refractory/post-onset protection; recovery
       * candidates have their own spacing and are deduplicated against the
       * exact score on the main thread. */
      const candidateOnly = !strictPhysicalAttack;
      const onsetGapOkay = candidateOnly
        ? onsetTime - this.lastCandidateTime > MIN_ONSET_GAP_SEC
        : onsetTime - this.lastOnsetTime > MIN_ONSET_GAP_SEC;

      if (
        (candidateOnly || this.armed) &&
        (strictPhysicalAttack || recoveryPhysicalAttack) &&
        onsetGapOkay
      ) {
        if (candidateOnly) {
          this.lastCandidateTime = onsetTime;
        } else {
          this.armed = false;
          this.postOnset = Math.min(
            this.odf1 * POST_ONSET_LIFT,
            baseThreshold * POST_ONSET_MAX_MULT,
          );
          this.lastOnsetTime = onsetTime;
          this.envelopeTrough = this.rms1;
        }
        // The local-maximum decision arrives one hop after the peak. End the
        // reference spectrum another hop before that peak, so it contains
        // only the room / already-ringing strings—not this hammer transient.
        const pre = new Float32Array(PITCH_FFT / 2);
        this._spectrum(pre, HOP * 2);
        // Pause release decisions from the physical onset onward. Waiting for
        // deferred pitch voting would let the new chord tone disturb an older
        // note's release envelope for several hundred milliseconds first.
        this._markReleaseOverlap(onsetTime);

        this.pending.push({
          id: this.nextOnsetId++,
          pre,
          time: onsetTime,
          // Relative to the room, so "loud" means loud HERE.
          strength: this.odf1 / (baseThreshold || 1e-6),
          sustain: this.sustain,
          peakRms: this.rms1,
          gate,
          attackRatio,
          frameAttackRatio,
          novelty: this.novelty1,
          attackBandCoverage: this.attackBandCoverage1,
          attackHighRatio: this.attackHighRatio1,
          spectralFlatness: this.spectralFlatness1,
          referenceTransient,
          candidateOnly,
          estimates: [],
          yinEstimates: [],
          emergentEstimates: [],
        });
        this._debug('onset', {
          time: onsetTime,
          rms: this.rms1,
          gate,
          attackRatio,
          frameAttackRatio,
          novelty: this.novelty1,
          attackBandCoverage: this.attackBandCoverage1,
          attackHighRatio: this.attackHighRatio1,
          spectralFlatness: this.spectralFlatness1,
          odf: this.odf1,
          threshold,
        });
      }
    }

    this.odf2 = this.odf1;
    this.odf1 = odf;
    this.novelty1 = novelty;
    this.attackBandCoverage1 = attackBandCoverage;
    this.attackHighRatio1 = attackHighRatio;
    this.spectralFlatness1 = spectralFlatness;
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
        if (yin) item.yinEstimates.push(yin);
        if (emergent) item.emergentEstimates.push(emergent);
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
