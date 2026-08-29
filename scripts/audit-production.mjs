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
  '.et-analysis__progress i { animation: et-analysis-progress',
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

const redirects = readFileSync(new URL('_redirects', dist), 'utf8').trim();
if (redirects !== '/* /index.html 200') throw new Error('SPA fallback is missing from the build.');

console.log('Production audit passed: metadata, assets, SPA fallback, and lesson navigation.');
