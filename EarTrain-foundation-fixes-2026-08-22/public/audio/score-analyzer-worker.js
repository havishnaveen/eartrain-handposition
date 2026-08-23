/**
 * EarTrain score-aware take analysis.
 *
 * The live worklet answers "did something piano-like just happen?" quickly.
 * This worker answers the slower and more important grading question:
 * "is there acoustic evidence for each note that the score says belongs in
 * this time region?" It receives lossless PCM, builds overlapping spectra,
 * evaluates exact harmonic templates repeatedly, selects a monotonic note
 * path, and admits unexpected notes only through a stricter open-world gate.
 */

const FFT_SIZE = 2048;
const HOP = 256;
const MIN_FREQ = 82;
const MAX_FREQ = 1400;
const HARMONIC_PARENT_INTERVALS = [7, 12, 19, 24, 28, 31, 34, 36];

function clamp(value, low = 0, high = 1) {
  return Math.min(high, Math.max(low, value));
}

function median(values) {
  if (!values.length) return 0;
  const copy = [...values].sort((a, b) => a - b);
  const middle = copy.length >> 1;
  return copy.length % 2 ? copy[middle] : (copy[middle - 1] + copy[middle]) / 2;
}

function meanRange(values, from, to) {
  const start = Math.max(0, from);
  const end = Math.min(values.length, to);
  if (end <= start) return 0;
  let sum = 0;
  for (let index = start; index < end; index++) sum += values[index];
  return sum / (end - start);
}

function nearestFrame(frameTimes, time) {
  if (frameTimes.length === 0) return 0;
  let low = 0;
  let high = frameTimes.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (frameTimes[middle] < time) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(frameTimes[low - 1] - time) < Math.abs(frameTimes[low] - time)) {
    return low - 1;
  }
  return low;
}

function midiFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function fft(re, im) {
  const size = re.length;
  for (let index = 1, swap = 0; index < size; index++) {
    let bit = size >> 1;
    for (; swap & bit; bit >>= 1) swap ^= bit;
    swap ^= bit;
    if (index < swap) {
      let value = re[index]; re[index] = re[swap]; re[swap] = value;
      value = im[index]; im[index] = im[swap]; im[swap] = value;
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);
    for (let offset = 0; offset < size; offset += length) {
      let twiddleReal = 1;
      let twiddleImag = 0;
      for (let bin = 0; bin < length / 2; bin++) {
        const evenReal = re[offset + bin];
        const evenImag = im[offset + bin];
        const oddIndex = offset + bin + length / 2;
        const oddReal = re[oddIndex] * twiddleReal - im[oddIndex] * twiddleImag;
        const oddImag = re[oddIndex] * twiddleImag + im[oddIndex] * twiddleReal;
        re[offset + bin] = evenReal + oddReal;
        im[offset + bin] = evenImag + oddImag;
        re[oddIndex] = evenReal - oddReal;
        im[oddIndex] = evenImag - oddImag;
        const nextReal = twiddleReal * stepReal - twiddleImag * stepImag;
        twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

/** Two one-pole high-pass stages remove DC, handling noise, and mains rumble. */
function highpass(samples, sampleRate) {
  const result = new Float32Array(samples.length);
  const alpha = Math.exp((-2 * Math.PI * 72) / sampleRate);
  let previousInput1 = 0;
  let previousOutput1 = 0;
  let previousInput2 = 0;
  let previousOutput2 = 0;
  for (let index = 0; index < samples.length; index++) {
    const first = alpha * (previousOutput1 + samples[index] - previousInput1);
    previousInput1 = samples[index];
    previousOutput1 = first;
    const second = alpha * (previousOutput2 + first - previousInput2);
    previousInput2 = first;
    previousOutput2 = second;
    result[index] = second;
  }
  return result;
}

function smoothTrack(values) {
  const result = new Float32Array(values.length);
  for (let index = 0; index < values.length; index++) {
    result[index] =
      values[Math.max(0, index - 1)] * 0.25 +
      values[index] * 0.5 +
      values[Math.min(values.length - 1, index + 1)] * 0.25;
  }
  return result;
}

function buildAnalysis(samples, sampleRate, captureStartTime, midiValues) {
  const filtered = highpass(samples, sampleRate);
  const frameCount = Math.max(0, Math.floor((filtered.length - FFT_SIZE) / HOP) + 1);
  const frameTimes = new Float64Array(frameCount);
  const rms = new Float32Array(frameCount);
  const flux = new Float32Array(frameCount);
  const flatness = new Float32Array(frameCount);
  const salience = new Map();
  const fundamental = new Map();
  midiValues.forEach((midi) => {
    salience.set(midi, new Float32Array(frameCount));
    fundamental.set(midi, new Float32Array(frameCount));
  });

  const window = new Float32Array(FFT_SIZE);
  for (let index = 0; index < FFT_SIZE; index++) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
  }
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);
  const magnitude = new Float32Array(FFT_SIZE / 2);
  const previousMagnitude = new Float32Array(FFT_SIZE / 2);
  const binHz = sampleRate / FFT_SIZE;

  const peakAndFloor = (frequency) => {
    const center = frequency / binHz;
    const centerBin = Math.round(center);
    if (centerBin < 2 || centerBin + 8 >= magnitude.length) return { peak: 0, floor: 0 };
    const radius = frequency < 650 ? 2 : 1;
    let peak = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      peak = Math.max(peak, magnitude[centerBin + offset]);
    }
    let floor = 0;
    let count = 0;
    for (const direction of [-1, 1]) {
      for (let offset = radius + 3; offset <= radius + 7; offset++) {
        floor += magnitude[centerBin + direction * offset];
        count += 1;
      }
    }
    return { peak, floor: count ? floor / count : 0 };
  };

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const start = frameIndex * HOP;
    frameTimes[frameIndex] = captureStartTime + (start + FFT_SIZE / 2) / sampleRate;
    let sumSquares = 0;
    let mean = 0;
    for (let index = 0; index < FFT_SIZE; index++) mean += filtered[start + index];
    mean /= FFT_SIZE;
    for (let index = 0; index < FFT_SIZE; index++) {
      const sample = filtered[start + index] - mean;
      sumSquares += sample * sample;
      real[index] = sample * window[index];
      imag[index] = 0;
    }
    rms[frameIndex] = Math.sqrt(sumSquares / FFT_SIZE);
    fft(real, imag);

    let positiveFlux = 0;
    let logSum = 0;
    let linearSum = 0;
    let flatCount = 0;
    const lowBin = Math.max(1, Math.floor(90 / binHz));
    const highBin = Math.min(magnitude.length - 1, Math.ceil(7000 / binHz));
    for (let bin = 0; bin < magnitude.length; bin++) {
      const value = Math.hypot(real[bin], imag[bin]) / FFT_SIZE;
      magnitude[bin] = value;
      if (bin >= lowBin && bin <= highBin) {
        positiveFlux += Math.max(0, value - previousMagnitude[bin]);
        linearSum += value;
        logSum += Math.log(Math.max(1e-12, value));
        flatCount += 1;
      }
    }
    flux[frameIndex] = positiveFlux;
    flatness[frameIndex] = flatCount && linearSum > 0
      ? Math.min(1, Math.exp(logSum / flatCount) / (linearSum / flatCount))
      : 1;
    previousMagnitude.set(magnitude);

    midiValues.forEach((midi) => {
      const baseFrequency = midiFrequency(midi);
      let harmonicSum = 0;
      let fundamentalExcess = 0;
      for (let harmonic = 1; harmonic <= 8; harmonic++) {
        const frequency = baseFrequency * harmonic;
        if (frequency >= Math.min(8000, sampleRate * 0.46)) break;
        const { peak, floor } = peakAndFloor(frequency);
        const excess = Math.max(0, peak - floor * 1.04);
        if (harmonic === 1) fundamentalExcess = excess;
        harmonicSum += excess / Math.pow(harmonic, 0.72);
      }
      salience.get(midi)[frameIndex] = harmonicSum;
      fundamental.get(midi)[frameIndex] = fundamentalExcess;
    });
  }

  midiValues.forEach((midi) => {
    salience.set(midi, smoothTrack(salience.get(midi)));
    fundamental.set(midi, smoothTrack(fundamental.get(midi)));
  });
  return {
    frameTimes,
    rms,
    flux,
    flatness,
    salience,
    fundamental,
    filtered,
    sampleRate,
    captureStartTime,
  };
}

/**
 * Refine an accepted note with an independent 512-sample harmonic envelope.
 * The slower 2048-sample pass decides whether the pitch exists; this short
 * pass timestamps its physical attack without pulling the answer toward the
 * written beat. That separation is essential for honest rhythm grading.
 */
function refineOnset(analysis, midi, approximateTime) {
  const size = 512;
  const hop = 64;
  const frequency = midiFrequency(midi);
  const fromTime = approximateTime - 0.14;
  const toTime = approximateTime + 0.14;
  const firstCenter = Math.max(
    size / 2,
    Math.floor((fromTime - analysis.captureStartTime) * analysis.sampleRate),
  );
  const lastCenter = Math.min(
    analysis.filtered.length - size / 2 - 1,
    Math.ceil((toTime - analysis.captureStartTime) * analysis.sampleRate),
  );
  if (lastCenter <= firstCenter) return approximateTime;

  const centers = [];
  const target = [];
  const neighbors = [];
  const shortWindow = new Float32Array(size);
  for (let index = 0; index < size; index++) {
    shortWindow[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  }
  const toneEnergy = (center, baseFrequency) => {
    let sum = 0;
    for (let harmonic = 1; harmonic <= 3; harmonic++) {
      const partialFrequency = baseFrequency * harmonic;
      if (partialFrequency >= analysis.sampleRate * 0.46) break;
      let real = 0;
      let imag = 0;
      const start = center - size / 2;
      const step = (2 * Math.PI * partialFrequency) / analysis.sampleRate;
      const stepReal = Math.cos(step);
      const stepImag = Math.sin(step);
      let phaseReal = Math.cos(step * start);
      let phaseImag = Math.sin(step * start);
      for (let windowIndex = 0; windowIndex < size; windowIndex++) {
        const sample = analysis.filtered[start + windowIndex] * shortWindow[windowIndex];
        real += sample * phaseReal;
        imag -= sample * phaseImag;
        const nextReal = phaseReal * stepReal - phaseImag * stepImag;
        phaseImag = phaseReal * stepImag + phaseImag * stepReal;
        phaseReal = nextReal;
      }
      sum += Math.hypot(real, imag) / (size * Math.pow(harmonic, 0.72));
    }
    return sum;
  };

  for (let center = firstCenter; center <= lastCenter; center += hop) {
    centers.push(center);
    target.push(toneEnergy(center, frequency));
    neighbors.push(Math.max(
      toneEnergy(center, midiFrequency(midi - 1)),
      toneEnergy(center, midiFrequency(midi + 1)),
    ));
  }

  let bestIndex = -1;
  let bestScore = 0;
  const floor = Math.max(1e-10, median(target.slice(0, Math.min(18, target.length))));
  for (let index = 7; index < target.length - 9; index++) {
    const before = meanRange(target, index - 7, index - 2);
    const after = meanRange(target, index + 2, index + 9);
    const neighborAfter = meanRange(neighbors, index + 2, index + 9);
    const rise = Math.max(0, after - before);
    const contrast = (after + floor * 0.25) / (neighborAfter + floor * 0.25);
    const score = rise * clamp((contrast - 0.94) / 0.28, 0.08, 1);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  if (bestIndex < 0) return approximateTime;
  return analysis.captureStartTime + centers[bestIndex] / analysis.sampleRate;
}

/** Independent time-domain fundamental check for open-world wrong notes. */
function yinAt(analysis, onsetTime) {
  const size = 2048;
  const start = Math.round(
    (onsetTime - analysis.captureStartTime + 0.018) * analysis.sampleRate,
  );
  if (start < 0 || start + size >= analysis.filtered.length) return null;
  const tauMin = Math.max(2, Math.floor(analysis.sampleRate / MAX_FREQ));
  const tauMax = Math.min(Math.floor(size / 2), Math.floor(analysis.sampleRate / MIN_FREQ));
  const difference = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let index = 0; index < size - tauMax; index++) {
      const delta = analysis.filtered[start + index] - analysis.filtered[start + index + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }
  const cmnd = new Float32Array(tauMax + 1);
  let running = 0;
  let tau = -1;
  for (let index = tauMin; index <= tauMax; index++) {
    running += difference[index];
    cmnd[index] = running === 0
      ? 1
      : difference[index] * (index - tauMin + 1) / running;
  }
  for (let index = tauMin + 1; index < tauMax; index++) {
    if (cmnd[index] >= 0.24) continue;
    while (index + 1 < tauMax && cmnd[index + 1] < cmnd[index]) index += 1;
    tau = index;
    break;
  }
  if (tau < 0) return null;
  const frequency = analysis.sampleRate / tau;
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) return null;
  const clarity = 1 - cmnd[tau];
  if (clarity < 0.48) return null;
  return {
    midi: Math.round(69 + 12 * Math.log2(frequency / 440)),
    clarity,
  };
}

function localNoise(track, frameTimes, playStartTime) {
  const values = [];
  for (let index = 0; index < frameTimes.length; index++) {
    if (frameTimes[index] >= playStartTime - 0.045) break;
    values.push(track[index]);
  }
  const body = median(values);
  const deviations = values.map((value) => Math.abs(value - body));
  return Math.max(1e-10, body + median(deviations) * 2.4);
}

function evidenceAt(analysis, midi, frameIndex, noise, expectedTime, secondsPerBeat) {
  const target = analysis.salience.get(midi);
  const targetFundamental = analysis.fundamental.get(midi);
  if (!target || !targetFundamental) return null;
  const lower = analysis.salience.get(midi - 1);
  const upper = analysis.salience.get(midi + 1);
  const octaveLower = analysis.salience.get(midi - 12);
  const octaveLowerFundamental = analysis.fundamental.get(midi - 12);

  const pre = meanRange(target, frameIndex - 10, frameIndex - 3);
  const post = meanRange(target, frameIndex + 3, frameIndex + 16);
  const fundamentalPost = meanRange(targetFundamental, frameIndex + 3, frameIndex + 16);
  const adjacent = Math.max(
    lower ? meanRange(lower, frameIndex + 3, frameIndex + 16) : 0,
    upper ? meanRange(upper, frameIndex + 3, frameIndex + 16) : 0,
    noise * 0.5,
  );
  const lowerOctaveSalience = octaveLower
    ? meanRange(octaveLower, frameIndex + 3, frameIndex + 16)
    : 0;
  const lowerOctaveFundamental = octaveLowerFundamental
    ? meanRange(octaveLowerFundamental, frameIndex + 3, frameIndex + 16)
    : 0;
  const rise = (post + noise * 0.35) / (pre + noise * 0.35);
  const snr = post / noise;
  const contrast = (post + noise * 0.25) / (adjacent + noise * 0.25);
  const fundamentalSnr = fundamentalPost / Math.max(noise * 0.12, 1e-10);
  const octaveConflict =
    lowerOctaveSalience > post * 0.88 &&
    lowerOctaveFundamental > fundamentalPost * 1.18;
  let strongestHarmonicParentMidi = null;
  let strongestHarmonicParentFundamental = 0;
  let strongestHarmonicParentSalience = 0;
  HARMONIC_PARENT_INTERVALS.forEach((interval) => {
    const parentMidi = midi - interval;
    const parentFundamentalTrack = analysis.fundamental.get(parentMidi);
    const parentSalienceTrack = analysis.salience.get(parentMidi);
    if (!parentFundamentalTrack || !parentSalienceTrack) return;
    const parentFundamental = meanRange(parentFundamentalTrack, frameIndex + 3, frameIndex + 16);
    if (parentFundamental <= strongestHarmonicParentFundamental) return;
    strongestHarmonicParentMidi = parentMidi;
    strongestHarmonicParentFundamental = parentFundamental;
    strongestHarmonicParentSalience = meanRange(
      parentSalienceTrack,
      frameIndex + 3,
      frameIndex + 16,
    );
  });

  let persistentFrames = 0;
  for (let index = frameIndex + 3; index < Math.min(target.length, frameIndex + 19); index++) {
    const neighbor = Math.max(lower?.[index] ?? 0, upper?.[index] ?? 0, noise * 0.5);
    if (target[index] > noise * 1.12 && target[index] > neighbor * 0.92) persistentFrames += 1;
  }
  let localFlux = 0;
  for (let index = Math.max(0, frameIndex - 1); index <= Math.min(analysis.flux.length - 1, frameIndex + 2); index++) {
    localFlux = Math.max(localFlux, analysis.flux[index]);
  }
  const fluxFloor = median(Array.from(analysis.flux.slice(
    Math.max(0, frameIndex - 40),
    Math.min(analysis.flux.length, frameIndex + 40),
  ))) || 1e-10;
  const fluxRatio = localFlux / fluxFloor;
  const rmsBefore = meanRange(analysis.rms, frameIndex - 8, frameIndex - 3);
  const rmsAfter = meanRange(analysis.rms, frameIndex + 1, frameIndex + 5);
  const rmsRise = rmsAfter / Math.max(1e-10, rmsBefore);
  // A repeated expected MIDI may not reuse the ringing tail of its previous
  // note. It needs a fresh broadband hammer pulse plus either renewed target
  // energy or a visible envelope attack. Requiring two independent cues is
  // what separates a soft re-strike from slow beating in one held string.
  const rearticulated =
    (rise >= 1.045 && fluxRatio >= 1.3) ||
    (rmsRise >= 1.025 && fluxRatio >= 1.5) ||
    (rise >= 1.012 && rmsRise >= 1.008 && fluxRatio >= 2.05);
  // A lower active string is allowed to explain an upper partial only when
  // the supposed upper note lacks its own fresh hammer attack. This protects
  // C→G and octave melodies: a genuinely struck G has re-articulation; the
  // third partial of a held C does not.
  const harmonicParentConflict = Boolean(
    strongestHarmonicParentMidi !== null &&
    strongestHarmonicParentSalience > post * 0.74 &&
    strongestHarmonicParentFundamental > fundamentalPost * 1.28 &&
    fundamentalSnr < 3.2 &&
    !rearticulated
  );
  const timingErrorBeats = Number.isFinite(expectedTime)
    ? Math.abs(analysis.frameTimes[frameIndex] - expectedTime) / secondsPerBeat
    : 0;
  const postFlatness = meanRange(analysis.flatness, frameIndex + 8, frameIndex + 16);
  const attackFlatness = analysis.flatness[frameIndex];
  // Speech often produces a tonal vowel with no piano-like hammer onset. A
  // conservative veto requires all four cues: tonal attack, tonal tail, weak
  // attack rise, and a short-lived semitone track (normally caused by vocal
  // pitch motion). Quiet piano may lack amplitude, but retains either a sharp
  // broadband hammer or a longer stable string resonance.
  const speechLike =
    attackFlatness <= 0.58 &&
    postFlatness <= 0.74 &&
    rise < 2.4 &&
    persistentFrames <= 13;

  let evidence =
    clamp(Math.log2(Math.max(1, snr)) / 2.8) * 0.29 +
    clamp(Math.log2(Math.max(1, contrast)) / 1.25) * 0.23 +
    clamp(Math.log2(Math.max(1, rise)) / 1.8) * 0.2 +
    clamp(persistentFrames / 9) * 0.15 +
    clamp(Math.log2(Math.max(1, fundamentalSnr)) / 3) * 0.08 +
    clamp(Math.log2(Math.max(1, fluxRatio)) / 3.5) * 0.05;
  evidence -= Math.min(0.15, timingErrorBeats * 0.1);
  if (octaveConflict) evidence -= 0.28;
  if (harmonicParentConflict) evidence -= 0.3;
  if (analysis.flatness[frameIndex] > 0.78 && persistentFrames < 7) evidence -= 0.22;

  return {
    frameIndex,
    time: analysis.frameTimes[frameIndex],
    evidence: clamp(evidence),
    snr,
    contrast,
    rise,
    fundamentalSnr,
    persistentFrames,
    octaveConflict,
    harmonicParentConflict,
    harmonicParentMidi: strongestHarmonicParentMidi,
    fluxRatio,
    rmsRise,
    rearticulated,
    timingErrorBeats,
    attackFlatness,
    postFlatness,
    speechLike,
  };
}

function candidatesForSlot(analysis, slot, midi, noise, playStartTime, secondsPerBeat) {
  const expectedTime = playStartTime + slot.beat * secondsPerBeat;
  const radius = Math.max(0.13, secondsPerBeat * (slot.beats <= 0.25 ? 0.34 : 0.62));
  const from = nearestFrame(analysis.frameTimes, expectedTime - radius);
  const to = nearestFrame(analysis.frameTimes, expectedTime + radius);
  const candidates = [];
  for (let index = Math.max(12, from); index <= Math.min(analysis.frameTimes.length - 20, to); index++) {
    const evidence = evidenceAt(analysis, midi, index, noise, expectedTime, secondsPerBeat);
    if (!evidence) continue;
    const acceptable =
      !evidence.speechLike &&
      !evidence.octaveConflict &&
      !evidence.harmonicParentConflict && (
      (
        evidence.evidence >= 0.43 &&
        evidence.snr >= 1.3 &&
        evidence.contrast >= 1.075 &&
        evidence.persistentFrames >= 7
      ) ||
      (
        evidence.evidence >= 0.36 &&
        evidence.timingErrorBeats <= 0.3 &&
        evidence.snr >= 1.42 &&
        evidence.contrast >= 1.09 &&
        evidence.rise >= 1.035 &&
        evidence.persistentFrames >= 8
      ));
    if (acceptable) candidates.push(evidence);
  }
  candidates.sort((a, b) => b.evidence - a.evidence || a.timingErrorBeats - b.timingErrorBeats);
  const separated = [];
  for (const candidate of candidates) {
    if (separated.some((chosen) => Math.abs(chosen.frameIndex - candidate.frameIndex) < 4)) continue;
    separated.push(candidate);
    if (separated.length === 7) break;
  }
  return separated;
}

function chooseMonotonicPath(candidateSets, expectedNotes, secondsPerBeat) {
  let states = [{ score: 0, lastTime: -Infinity, choices: [] }];
  for (let slotIndex = 0; slotIndex < candidateSets.length; slotIndex++) {
    const nextStates = [];
    const previousBeat = slotIndex > 0 ? expectedNotes[slotIndex - 1].beat : null;
    const beatGap = previousBeat === null
      ? 1
      : Math.max(0.05, expectedNotes[slotIndex].beat - previousBeat);
    const minimumGap = Math.min(0.12, Math.max(0.038, beatGap * secondsPerBeat * 0.28));
    const repeatsPreviousPitch =
      slotIndex > 0 &&
      Number(expectedNotes[slotIndex - 1].midi) === Number(expectedNotes[slotIndex].midi);
    for (const state of states) {
      nextStates.push({
        score: state.score - 0.48,
        lastTime: state.lastTime,
        choices: [...state.choices, null],
      });
      for (const candidate of candidateSets[slotIndex]) {
        if (candidate.time <= state.lastTime + minimumGap) continue;
        if (repeatsPreviousPitch && state.choices[slotIndex - 1] && !candidate.rearticulated) {
          continue;
        }
        nextStates.push({
          score: state.score + candidate.evidence * 1.8 - candidate.timingErrorBeats * 0.06,
          lastTime: candidate.time,
          choices: [...state.choices, candidate],
        });
      }
    }
    nextStates.sort((a, b) => b.score - a.score);
    states = nextStates.slice(0, 72);
  }
  return states[0]?.choices ?? candidateSets.map(() => null);
}

function sustainFor(analysis, midi, candidate, noise, expectedSeconds, nextTime) {
  const track = analysis.salience.get(midi);
  if (!track) return {};
  const maximumTime = Math.min(
    analysis.frameTimes[analysis.frameTimes.length - 1],
    candidate.time + Math.max(1, expectedSeconds + 1.1),
    Number.isFinite(nextTime) ? nextTime + 0.16 : Infinity,
  );
  const endIndex = nearestFrame(analysis.frameTimes, maximumTime);
  let peak = noise;
  let lastAlive = candidate.frameIndex;
  let releaseIndex = null;
  for (let index = candidate.frameIndex + 3; index <= endIndex; index++) {
    const value = track[index];
    peak = Math.max(peak, value);
    if (value > noise * 1.22) lastAlive = index;
    if (index < candidate.frameIndex + 18) continue;
    const before = meanRange(track, index - 7, index - 2);
    const after = meanRange(track, index + 1, index + 6);
    if (before > noise * 1.5 && after < before * 0.52 && after < peak * 0.42) {
      releaseIndex = index;
      break;
    }
  }
  const result = {
    lastSustainTime: analysis.frameTimes[lastAlive],
    sustainConfidence: clamp(0.42 + candidate.evidence * 0.52),
  };
  if (releaseIndex !== null) {
    result.endTime = analysis.frameTimes[releaseIndex];
    result.durationConfidence = clamp(0.56 + candidate.evidence * 0.34);
  }
  return result;
}

function matchRealtime(realtime, usedRealtime, midi, time, secondsPerBeat) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  const window = Math.max(0.11, Math.min(0.28, secondsPerBeat * 0.38));
  for (let index = 0; index < realtime.length; index++) {
    if (usedRealtime.has(index) || realtime[index].midi !== midi) continue;
    const distance = Math.abs(realtime[index].time - time);
    if (distance <= window && distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  if (bestIndex >= 0) usedRealtime.add(bestIndex);
  return bestIndex >= 0 ? realtime[bestIndex] : null;
}

function analyzeTake(payload) {
  const sampleRate = Number(payload.sampleRate);
  const captureStartTime = Number(payload.captureStartTime);
  const playStartTime = Number(payload.playStartTime);
  const secondsPerBeat = Number(payload.plan?.secondsPerBeat);
  const expectedNotes = Array.isArray(payload.plan?.expectedNotes) ? payload.plan.expectedNotes : [];
  const realtime = Array.isArray(payload.realtime) ? payload.realtime : [];
  const samples = new Float32Array(payload.samples);
  if (
    !Number.isFinite(sampleRate) ||
    !Number.isFinite(captureStartTime) ||
    !Number.isFinite(playStartTime) ||
    !Number.isFinite(secondsPerBeat) ||
    samples.length < FFT_SIZE
  ) {
    return { notes: realtime, recovered: 0, rejected: 0, reason: 'invalid-capture' };
  }

  const midiValues = new Set();
  // The curriculum's acoustic range is small enough to keep a complete
  // semitone bank. Expected tones get contextual leniency later; this full
  // bank exists so a confidently wrong key can still be reported even when
  // the live detector missed it.
  for (let midi = 42; midi <= 89; midi++) {
    const frequency = midiFrequency(midi);
    if (frequency >= MIN_FREQ && frequency <= MAX_FREQ) midiValues.add(midi);
  }
  expectedNotes.forEach((slot) => {
    const midi = Number(slot.midi);
    if (!Number.isFinite(midi)) return;
    [midi, midi - 1, midi + 1, midi - 12, midi + 12].forEach((value) => {
      const frequency = midiFrequency(value);
      if (frequency >= MIN_FREQ && frequency <= MAX_FREQ) midiValues.add(value);
    });
  });
  realtime.forEach((note) => {
    const midi = Number(note.midi);
    if (!Number.isFinite(midi)) return;
    [midi, midi - 1, midi + 1, midi - 12, midi + 12].forEach((value) => {
      const frequency = midiFrequency(value);
      if (frequency >= MIN_FREQ && frequency <= MAX_FREQ) midiValues.add(value);
    });
  });
  const analysis = buildAnalysis(
    samples,
    sampleRate,
    captureStartTime,
    [...midiValues],
  );
  if (analysis.frameTimes.length === 0) {
    return { notes: realtime, recovered: 0, rejected: 0, reason: 'empty-analysis' };
  }

  const noiseByMidi = new Map();
  midiValues.forEach((midi) => {
    noiseByMidi.set(midi, localNoise(analysis.salience.get(midi), analysis.frameTimes, playStartTime));
  });
  const candidateSets = expectedNotes.map((slot) => {
    const midi = Number(slot.midi);
    return candidatesForSlot(
      analysis,
      slot,
      midi,
      noiseByMidi.get(midi) ?? 1e-10,
      playStartTime,
      secondsPerBeat,
    );
  });
  const chosen = chooseMonotonicPath(candidateSets, expectedNotes, secondsPerBeat);
  const usedRealtime = new Set();
  const notes = [];
  let recovered = 0;

  chosen.forEach((candidate, slotIndex) => {
    if (!candidate) return;
    const slot = expectedNotes[slotIndex];
    const midi = Number(slot.midi);
    const realtimeMatch = matchRealtime(realtime, usedRealtime, midi, candidate.time, secondsPerBeat);
    // The live detector is optimized for responsiveness and its timestamp
    // can be one hop away from the true hammer edge. Once lossless PCM is
    // available, always refine the onset from the waveform—even when the
    // live event supplied the pitch. This removes the 4.3–4.8 ceiling on a
    // genuinely dead-centre take without snapping an actually late note to
    // the written score.
    const refinedTime = refineOnset(analysis, midi, candidate.time);
    const refinedCandidate = {
      ...candidate,
      time: refinedTime,
      frameIndex: nearestFrame(analysis.frameTimes, refinedTime),
    };
    const nextCandidate = chosen.slice(slotIndex + 1).find(Boolean);
    const sustain = sustainFor(
      analysis,
      midi,
      refinedCandidate,
      noiseByMidi.get(midi) ?? 1e-10,
      Number(slot.beats) * secondsPerBeat,
      nextCandidate?.time,
    );
    if (!realtimeMatch) recovered += 1;
    notes.push({
      ...(realtimeMatch ?? {}),
      midi,
      time: refinedTime,
      clarity: Math.max(Number(realtimeMatch?.clarity) || 0, candidate.evidence),
      strength: Math.max(Number(realtimeMatch?.strength) || 0, candidate.snr),
      sustain: Number(realtimeMatch?.sustain) || 1,
      ...sustain,
      analysisSource: realtimeMatch ? 'reconciled' : 'offline-recovered',
      analysisConfidence: candidate.evidence,
      analysisSnr: candidate.snr,
      analysisContrast: candidate.contrast,
      analysisRise: candidate.rise,
      analysisPersistence: candidate.persistentFrames,
      analysisFlatness: analysis.flatness[candidate.frameIndex],
      analysisPostFlatness: candidate.postFlatness,
      analysisSpeechLike: candidate.speechLike,
    });
  });

  // Search missing score slots for a strongly supported alternative pitch.
  // There is deliberately no soft-recovery lane here: reporting a wrong note
  // is more damaging than overlooking a very quiet wrong note, so unexpected
  // pitches need open-world confidence, contrast, attack, and persistence.
  const occupiedTimes = notes.map((note) => note.time);
  chosen.forEach((candidate, slotIndex) => {
    if (candidate) return;
    const slot = expectedNotes[slotIndex];
    const expectedMidi = Number(slot.midi);
    let best = null;
    for (const midi of midiValues) {
      if (midi === expectedMidi) continue;
      const alternatives = candidatesForSlot(
        analysis,
        slot,
        midi,
        noiseByMidi.get(midi) ?? 1e-10,
        playStartTime,
        secondsPerBeat,
      );
      for (const alternative of alternatives) {
        if (
          alternative.evidence < 0.72 ||
          alternative.snr < 3 ||
          alternative.contrast < 1.25 ||
          alternative.rise < 1.18 ||
          alternative.persistentFrames < 12 ||
          alternative.postFlatness > 0.76 ||
          alternative.speechLike ||
          alternative.octaveConflict ||
          alternative.harmonicParentConflict ||
          occupiedTimes.some((time) => Math.abs(time - alternative.time) < 0.085)
        ) continue;
        if (!best || alternative.evidence > best.evidence) {
          best = { ...alternative, midi };
        }
      }
    }
    if (!best) return;
    const yin = yinAt(analysis, best.time);
    if (!yin || yin.midi === expectedMidi) return;
    const resolved = candidatesForSlot(
      analysis,
      slot,
      yin.midi,
      noiseByMidi.get(yin.midi) ?? 1e-10,
      playStartTime,
      secondsPerBeat,
    ).find((alternative) => (
      Math.abs(alternative.time - best.time) <= 0.11 &&
      alternative.evidence >= 0.64 &&
      alternative.snr >= 2.5 &&
      alternative.contrast >= 1.16 &&
      alternative.rise >= 1.12 &&
      alternative.persistentFrames >= 10 &&
      alternative.postFlatness <= 0.76 &&
      !alternative.speechLike &&
      !alternative.octaveConflict &&
      !alternative.harmonicParentConflict
    ));
    if (!resolved) return;
    best = { ...resolved, midi: yin.midi, yinClarity: yin.clarity };
    const refinedTime = refineOnset(analysis, best.midi, best.time);
    const refinedCandidate = {
      ...best,
      time: refinedTime,
      frameIndex: nearestFrame(analysis.frameTimes, refinedTime),
    };
    const sustain = sustainFor(
      analysis,
      best.midi,
      refinedCandidate,
      noiseByMidi.get(best.midi) ?? 1e-10,
      Number(slot.beats) * secondsPerBeat,
      Infinity,
    );
    notes.push({
      midi: best.midi,
      time: refinedTime,
      clarity: best.evidence,
      strength: best.snr,
      sustain: 1,
      ...sustain,
      analysisSource: 'offline-discovered-extra',
      analysisConfidence: best.evidence,
      analysisSnr: best.snr,
      analysisContrast: best.contrast,
      analysisRise: best.rise,
      analysisPersistence: best.persistentFrames,
      analysisPostFlatness: best.postFlatness,
    });
    occupiedTimes.push(refinedTime);
  });

  // Unexpected notes receive no score-context leniency. They survive only
  // when lossless PCM independently proves a strong attack and stable pitch.
  for (let index = 0; index < realtime.length; index++) {
    if (usedRealtime.has(index)) continue;
    const note = realtime[index];
    const midi = Number(note.midi);
    const frameIndex = nearestFrame(analysis.frameTimes, Number(note.time));
    const evidence = evidenceAt(
      analysis,
      midi,
      frameIndex,
      noiseByMidi.get(midi) ?? 1e-10,
      NaN,
      secondsPerBeat,
    );
    const yin = yinAt(analysis, Number(note.time));
    if (
      !evidence ||
      !yin ||
      yin.midi !== midi ||
      evidence.evidence < 0.7 ||
      evidence.snr < 2.5 ||
      evidence.contrast < 1.22 ||
      evidence.rise < 1.15 ||
      evidence.persistentFrames < 10 ||
      evidence.postFlatness > 0.76 ||
      evidence.speechLike ||
      evidence.octaveConflict ||
      evidence.harmonicParentConflict
    ) continue;
    usedRealtime.add(index);
    notes.push({
      ...note,
      time: evidence.time,
      clarity: Math.max(Number(note.clarity) || 0, evidence.evidence),
      strength: Math.max(Number(note.strength) || 0, evidence.snr),
      analysisSource: 'offline-verified-extra',
    });
  }

  notes.sort((a, b) => a.time - b.time);
  return {
    notes,
    recovered,
    rejected: Math.max(0, realtime.length - usedRealtime.size),
    expectedAccepted: chosen.filter(Boolean).length,
    expectedCount: expectedNotes.length,
    reason: 'analyzed',
  };
}

self.onmessage = (event) => {
  const payload = event.data || {};
  if (payload.type !== 'analyze') return;
  try {
    const result = analyzeTake(payload);
    self.postMessage({
      type: 'analysis-complete',
      requestId: payload.requestId,
      ...result,
    });
  } catch (error) {
    self.postMessage({
      type: 'analysis-error',
      requestId: payload.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
