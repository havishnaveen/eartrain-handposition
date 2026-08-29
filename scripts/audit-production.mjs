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

for (const forbidden of ['DEV — Lesson', 'Jump to next lesson', 'Prove It skipped']) {
  if (scripts.includes(forbidden)) throw new Error(`Development control leaked into production: ${forbidden}`);
}

const redirects = readFileSync(new URL('_redirects', dist), 'utf8').trim();
if (redirects !== '/* /index.html 200') throw new Error('SPA fallback is missing from the build.');

console.log('Production audit passed: metadata, assets, SPA fallback, and dev-control isolation.');
