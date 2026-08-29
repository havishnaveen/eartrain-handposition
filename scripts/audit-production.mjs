import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const indexPath = new URL('index.html', dist);

if (!existsSync(indexPath)) {
  throw new Error('Production audit requires a fresh `npm run build`.');
}

const html = readFileSync(indexPath, 'utf8');
for (const required of [
  '<html lang="en">',
  'name="viewport"',
  'name="description"',
  'rel="icon"',
  '<title>EarTrain - Piano Ear Training</title>',
]) {
  if (!html.includes(required)) throw new Error(`Production metadata is missing: ${required}`);
}

for (const asset of html.matchAll(/(?:src|href)="\/(assets\/[^"?]+|eartrain-favicon\.svg)/g)) {
  if (!existsSync(new URL(asset[1], dist))) throw new Error(`Built asset is missing: /${asset[1]}`);
}
for (const vendor of [
  'vendor/magenta/tf.min.js',
  'vendor/magenta/transcription.js',
  'audio/magenta-transcriber-worker.js',
]) {
  if (!existsSync(new URL(vendor, dist))) throw new Error(`Piano transcription vendor is missing: /${vendor}`);
}

const scripts = readdirSync(new URL('assets/', dist))
  .filter((name) => name.endsWith('.js'))
  .map((name) => readFileSync(join(new URL('assets/', dist).pathname, name), 'utf8'))
  .join('\n');

for (const required of ['DEV — Lesson', 'Jump to next lesson']) {
  if (!scripts.includes(required)) throw new Error(`Lesson navigation missing from production: ${required}`);
}

const sourceRoot = new URL('../src/', import.meta.url);
const analysisCss = readFileSync(new URL('components/exercise.css', sourceRoot), 'utf8');
for (const required of [
  '.et-analysis__scan { animation: et-analysis-scan',
  '.et-analysis__progress i { transition: none;',
]) {
  if (!analysisCss.includes(required)) {
    throw new Error(`Reduced-motion grading indicator can freeze: ${required}`);
  }
}

const scoreAnalysis = readFileSync(new URL('audio/scoreAnalysis.ts', sourceRoot), 'utf8');
if (!scoreAnalysis.includes('const ANALYSIS_TIMEOUT_MS = 2_000')) {
  throw new Error('Whole-take grading timeout must remain bounded at two seconds.');
}
if (/basicPitch|BasicPitch/.test(scoreAnalysis)) {
  throw new Error('Blocking model inference returned to the grading path.');
}
if (!scoreAnalysis.includes('pianoConsensus') || !scoreAnalysis.includes('magenta-piano-consensus')) {
  throw new Error('Offline recovered notes are not protected by piano-model consensus.');
}

const exerciseReport = readFileSync(new URL('components/ExerciseReport.tsx', sourceRoot), 'utf8');
if (!exerciseReport.includes('const AUTO_ADVANCE_MS = 15000')) {
  throw new Error('Next Drill countdown must remain at 15 seconds.');
}
const staffCue = readFileSync(new URL('components/StaffCue.tsx', sourceRoot), 'utf8');
for (const engravingGuard of ["setFont('Inter, Roboto, sans-serif', 12", 'setXShift(9)']) {
  if (!staffCue.includes(engravingGuard)) {
    throw new Error(`Professional fingering placement regressed: ${engravingGuard}`);
  }
}
const pathwayRouter = readFileSync(new URL('components/PathwayRouter.tsx', sourceRoot), 'utf8');
if (!pathwayRouter.includes("return question.positionProof && !proofCompleted ? 'position-prompt' : 'prompt'")) {
  throw new Error('Per-drill position proof gate is no longer universal.');
}

const redirects = readFileSync(new URL('_redirects', dist), 'utf8').trim();
if (redirects !== '/* /index.html 200') throw new Error('SPA fallback is missing from the build.');

console.log('Production audit passed: metadata, assets, SPA fallback, and lesson navigation.');
