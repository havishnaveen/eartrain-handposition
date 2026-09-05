import { existsSync, readFileSync } from 'node:fs';

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
const sourceRoot = new URL('../src/', import.meta.url);
const analysisCss = readFileSync(new URL('components/exercise.css', sourceRoot), 'utf8');

const scoreAnalysis = readFileSync(new URL('audio/scoreAnalysis.ts', sourceRoot), 'utf8');
if (!scoreAnalysis.includes('const ANALYSIS_TIMEOUT_MS = 2_000')) {
  throw new Error('Whole-take grading timeout must remain bounded at two seconds.');
}
if (scoreAnalysis.includes("from '@spotify/basic-pitch'")) {
  throw new Error('Spotify model inference returned to the browser UI thread.');
}
if (!scoreAnalysis.includes('spotifyPianoConsensus') ||
    !scoreAnalysis.includes('spotify-basic-pitch-consensus')) {
  throw new Error('Offline recovered notes are not protected by Spotify/PCM consensus.');
}
const physicalLaneStart = scoreAnalysis.indexOf('const workerAnalysis = new Promise<ScoreAnalysisResult>');
const physicalLaneAwait = scoreAnalysis.indexOf('return trackedWorker');
const mlLaneStart = scoreAnalysis.indexOf('const transcript = await transcribeWithBasicPitch');
if (physicalLaneStart < 0 || physicalLaneAwait < physicalLaneStart || mlLaneStart < physicalLaneAwait) {
  throw new Error('Cold ML startup can race the first-take physical grading worker.');
}
const spotifyWorker = readFileSync(new URL('audio/basicPitchTranscriber.worker.ts', sourceRoot), 'utf8');
if (!spotifyWorker.includes("from '@spotify/basic-pitch'") ||
    !spotifyWorker.includes('transcription-progress')) {
  throw new Error('Spotify Basic Pitch must remain isolated in its progress-reporting worker.');
}

const exerciseReport = readFileSync(new URL('components/ExerciseReport.tsx', sourceRoot), 'utf8');
if (!exerciseReport.includes('const AUTO_ADVANCE_MS = 10000')) {
  throw new Error('Next Drill countdown must remain at 10 seconds.');
}
const staffCue = readFileSync(new URL('components/StaffCue.tsx', sourceRoot), 'utf8');
for (const engravingGuard of [
  "svg.setAttribute('width', String(viewBoxWidth * resolvedNotationScale))",
  "svg.setAttribute('height', String(viewBoxHeight * resolvedNotationScale))",
  "svg.style.removeProperty('height')",
]) {
  if (!staffCue.includes(engravingGuard)) {
    throw new Error(`Proportional staff scaling regressed: ${engravingGuard}`);
  }
}
const staffCueCss = readFileSync(new URL('components/staff-cue.css', sourceRoot), 'utf8');
if (!staffCueCss.includes('.et-staff--scaled svg path') ||
    !staffCueCss.includes('vector-effect: none;')) {
  throw new Error('Scaled proof notation must scale staff and ledger-line stroke widths.');
}
const pathwayRouter = readFileSync(new URL('components/PathwayRouter.tsx', sourceRoot), 'utf8');
if (!pathwayRouter.includes("return question.positionProof && !proofCompleted ? 'position-prompt' : 'prompt'")) {
  throw new Error('Per-drill position proof gate is no longer universal.');
}
const app = readFileSync(new URL('App.tsx', sourceRoot), 'utf8');
if (!app.includes("import DevLessonJumper from './dev/DevLessonJumper'") ||
    !app.includes('<DevLessonJumper baseInitialLesson={initialLesson}>')) {
  throw new Error('The lesson jumper is no longer mounted around PathwayRouter.');
}
const exerciseView = readFileSync(new URL('components/ExerciseView.tsx', sourceRoot), 'utf8');
if (!exerciseView.includes("spatialChord && !showingPositionGate")) {
  throw new Error('Spatial chord rendering can bypass the universal position gate.');
}
if (!exerciseView.includes('Shift on 1–2, set the hand on 3–4')) {
  throw new Error('The hand-shift cue lost its four-beat musical instruction.');
}
if (!exerciseView.includes('Visible reference chord') ||
    !exerciseView.includes('Use the reference shape and the distance you heard') ||
    exerciseView.includes('SpatialKeyboardChallenge')) {
  throw new Error('Chord by Ear must show its reference and accept the target on a physical piano.');
}
const drillAudio = readFileSync(new URL('audio/useDrillAudio.ts', sourceRoot), 'utf8');
if (!drillAudio.includes('void warmBasicPitch();') ||
    !drillAudio.includes("type: 'prepare-chord'") ||
    !drillAudio.includes("type: 'listen-chord'")) {
  throw new Error('First-take model warmup or physical chord recognition was removed.');
}
if (!exerciseView.includes("status !== 'position-prompt' ? ' et-proof__layout--active' : ''") ||
    !exerciseView.includes('<div className="et-proof__identity">')) {
  throw new Error('The hand tile must stay centered before Start and remain beside the task afterward.');
}
if (!exerciseView.includes('notationScale={2.3}')) {
  throw new Error('The complete Prove It engraving is no longer proportionally enlarged.');
}
for (const layoutGuard of [
  'width: min(100%, 360px);',
  'width: min(100%, 760px);',
  'max-width: 360px;',
  'grid-template-areas: "stage";',
  'grid-template-areas: "identity task";',
  'min-height: 0;',
]) {
  if (!analysisCss.includes(layoutGuard)) {
    throw new Error(`Stable compact Prove It layout regressed: ${layoutGuard}`);
  }
}

const redirects = readFileSync(new URL('_redirects', dist), 'utf8').trim();
if (redirects !== '/* /index.html 200') throw new Error('SPA fallback is missing from the build.');

console.log('Production audit passed: metadata, assets, SPA fallback, and exercise safeguards.');
