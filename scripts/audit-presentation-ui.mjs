import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Run against the local visual-audit entry point, never a production backdoor.
const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5185';
const output = '/tmp/eartrain-presentation-audit';
await mkdir(output, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { PROGRESSIVE_CONCEPTS } = await server.ssrLoadModule('/src/curriculum/progressiveCurriculum.ts');
const cases = [];
for (const lesson of PROGRESSIVE_CONCEPTS) for (let slot = 1; slot <= 4; slot++) {
  const q = lesson.generate(slot, () => .5, .5, 'normal', slot);
  const frame = q.exerciseMode === 'spatial-chord' ? 'chord-search'
    : q.exerciseMode === 'blind-memory' ? 'memory-look'
    : q.exerciseMode === 'anchor-shift' ? 'shift-overview'
    : q.exerciseMode === 'prove-it' ? 'proof-play' : 'normal-prompt';
  cases.push({ lesson: lesson.index, slot, frame });
}
for (const frame of ['proof-prompt', 'proof-play', 'proof-success', 'grading', 'report', 'notice',
  'memory-prompt', 'memory-play', 'shift-rest', 'shift-land', 'chord-reference', 'chord-listen', 'chord-complete']) {
  cases.push({ lesson: frame.startsWith('proof') ? 7 : frame.startsWith('chord') ? 19 : frame.startsWith('shift') ? 14 : 9,
    slot: frame.startsWith('memory') ? 3 : 1, frame });
}
await server.close();
const browser = await puppeteer.launch({ headless: true });
const failures = [];
let checked = 0;
try {
  await Promise.all([320, 768, 1024, 1440].map(async (width) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width, height: width === 1440 ? 900 : 1100 });
    for (const item of cases) {
      errors.length = 0;
      const name = `${width}-L${item.lesson}-${item.slot}-${item.frame}`;
      await page.goto(`${base}/visual-audit.html?${new URLSearchParams(item)}`, { waitUntil: 'load' });
      await page.waitForSelector('.et-shell');
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const issues = await page.evaluate(() => {
        const issues = [];
        const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal overflow');
        for (const svg of document.querySelectorAll('.et-staff svg')) {
          const r = svg.getBoundingClientRect();
          if (r.width < 10 || r.height < 10) issues.push('empty engraving');
          const texts = [...svg.querySelectorAll('.vf-annotation')];
          // VexFlow nests annotations inside notehead groups. Compare actual
          // glyph paths, not parent groups that include the text itself.
          const heads = [...svg.querySelectorAll('.vf-notehead > path, .vf-accidental > path, .vf-beam > path')];
          for (const text of texts) {
            const box = text.getBoundingClientRect();
            if (heads.some((head) => overlap(box, head.getBoundingClientRect()))) issues.push('finger overlaps notehead');
            if (box.left < r.left - 1 || box.right > r.right + 1 || box.top < r.top - 1 || box.bottom > r.bottom + 1) issues.push('annotation outside SVG');
          }
          for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
            if (overlap(texts[i].getBoundingClientRect(), texts[j].getBoundingClientRect())) issues.push('finger annotations overlap');
          }
          const card = svg.closest('.et-cue');
          if (card) {
            const c = card.getBoundingClientRect();
            if (r.top < c.top - 1 || r.bottom > c.bottom + 1 || r.left < c.left - 1 || r.right > c.right + 1) issues.push('score escapes card');
          }
        }
        for (const guide of document.querySelectorAll('.et-staff-directions')) {
          const svg = guide.parentElement.querySelector('svg');
          if (svg && overlap(guide.getBoundingClientRect(), svg.getBoundingClientRect())) issues.push('directions overlap score');
        }
        const dialog = document.querySelector('.et-orientation-tip');
        if (dialog) {
          const r = dialog.getBoundingClientRect();
          if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) issues.push('dialog outside viewport');
          if (Math.abs((r.left + r.right) / 2 - innerWidth / 2) > 2 ||
              Math.abs((r.top + r.bottom) / 2 - innerHeight / 2) > 10) issues.push('dialog not centered');
          const overlay = document.querySelector('.et-orientation-gate');
          if (overlay && Number(getComputedStyle(dialog).zIndex) <= Number(getComputedStyle(overlay).zIndex)) issues.push('dialog behind blur');
        }
        return [...new Set(issues)];
      });
      if (issues.length || errors.length) failures.push({ name, issues, errors: [...errors] });
      // Archive every frame so a failing case is immediately inspectable.
      await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
      checked++;
    }
    console.log(`Checked ${width}px: ${cases.length} frames`);
    await page.close();
  }));
} finally { await browser.close(); }
await writeFile(`${output}/results.json`, JSON.stringify({ checked, failures }, null, 2));
console.log(JSON.stringify({ checked, failureCount: failures.length, failures: failures.slice(0, 20) }, null, 2));
assert.equal(failures.length, 0, `UI audit failures; screenshots in ${output}`);
