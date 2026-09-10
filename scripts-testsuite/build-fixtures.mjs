// Consumes fixtures-manifest.json (produced by derive-plan.mjs, which drove
// the app's own real reducer/generator) and synth.mjs (the project's own
// physically-modeled piano DSP, reused) to render actual .wav files for
// every slot of every test run, plus a browser-facing injection manifest
// telling the Puppeteer harness exactly what to play and when.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderPerformance, encodeWav } from './synth.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('./fixtures-manifest.json', import.meta.url), 'utf8'),
);

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url);
mkdirSync(FIXTURES_DIR, { recursive: true });

function groupByBeat(expectedNotes) {
  const groups = new Map();
  for (const note of expectedNotes) {
    const key = Math.round(note.beat * 1000);
    if (!groups.has(key)) groups.set(key, { beat: note.beat, beats: note.beats, midis: [] });
    const g = groups.get(key);
    g.midis.push(note.midi);
    g.beats = Math.max(g.beats, note.beats);
  }
  return [...groups.values()].sort((a, b) => a.beat - b.beat);
}

function buildMainWav(plan, seed) {
  const spb = plan.secondsPerBeat;
  const groups = groupByBeat(plan.expectedNotes);
  const notes = groups.map((g) => ({
    midis: g.midis,
    time: g.beat * spb,
    duration: Math.max(0.15, g.beats * spb - 0.04),
  }));
  const totalSeconds = plan.recordSeconds;
  return renderPerformance(notes, totalSeconds, { seed, amplitude: 0.24 });
}

function buildProofWav(positionProof, seed) {
  const midis = positionProof.proofMidi;
  const notes = midis.map((midi, i) => ({
    midis: [midi],
    time: i * 0.9,
    duration: 0.4,
  }));
  const totalSeconds = midis.length * 0.9 + 0.6;
  return renderPerformance(notes, totalSeconds, { seed, amplitude: 0.26 });
}

function buildSpatialWav(spatialChord, seed) {
  const [rootMidi, thirdMidi, fifthMidi] = spatialChord.chordMidi;
  const notes = [
    { midis: [rootMidi], time: 0, duration: 1.6 },
    { midis: [rootMidi, thirdMidi, fifthMidi], time: 1.5, duration: 2.6 },
  ];
  return renderPerformance(notes, 4.3, { seed, amplitude: 0.24 });
}

const injectionManifest = { seed: manifest.seed, runs: [] };
let seedCounter = 100;

for (const run of manifest.runs) {
  const runOut = { lesson: run.lesson, freshLoad: run.freshLoad, slots: [] };
  for (const slotEntry of run.slots) {
    const q = slotEntry.question;
    const slotOut = {
      slot: slotEntry.slot,
      statusOnEntry: slotEntry.statusOnEntry,
      exerciseMode: q.exerciseMode,
      expectedSequence: q.expectedSequence,
      injections: [],
    };

    if (slotEntry.statusOnEntry === 'position-prompt' && q.positionProofs?.length) {
      // One WAV per proof in order (e.g. right hand, then left hand for a
      // "both hands" position) -- PROOF_UNLOCK cycles back to
      // 'position-prompt' once per proof, so the harness must have a
      // distinct fixture ready for each cycle, not just the first.
      const proofFiles = q.positionProofs.map((proof, idx) => {
        const wav = buildProofWav(proof, seedCounter++);
        const fname = `lesson${run.lesson}-slot${slotEntry.slot}-proof${idx}.wav`;
        writeFileSync(new URL(fname, FIXTURES_DIR), encodeWav(wav));
        return { file: fname, proofNotes: proof.proofNotes };
      });
      slotOut.injections.push({
        kind: 'proof',
        proofs: proofFiles,
      });
    }

    if (q.exerciseMode === 'spatial-chord') {
      const wav = buildSpatialWav(q.spatialChord, seedCounter++);
      const fname = `lesson${run.lesson}-slot${slotEntry.slot}-spatial.wav`;
      writeFileSync(new URL(fname, FIXTURES_DIR), encodeWav(wav));
      slotOut.injections.push({
        kind: 'spatial',
        file: fname,
        chordPitches: q.spatialChord.chordPitches,
      });
    } else {
      const wav = buildMainWav(q.plan, seedCounter++);
      const fname = `lesson${run.lesson}-slot${slotEntry.slot}-main.wav`;
      writeFileSync(new URL(fname, FIXTURES_DIR), encodeWav(wav));
      slotOut.injections.push({
        kind: 'listening',
        file: fname,
        recordSeconds: q.plan.recordSeconds,
      });
    }

    runOut.slots.push(slotOut);
  }
  injectionManifest.runs.push(runOut);
}

writeFileSync(
  new URL('./injection-manifest.json', import.meta.url),
  JSON.stringify(injectionManifest, null, 2),
);
console.log('Wrote fixtures/*.wav and injection-manifest.json');
console.log(
  'Total WAV files:',
  injectionManifest.runs.reduce(
    (sum, r) => sum + r.slots.reduce((s2, sl) => s2 + sl.injections.length, 0),
    0,
  ),
);
