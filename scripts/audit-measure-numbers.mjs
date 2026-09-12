import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5187';

// Load curriculum to test every lesson and slot
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});
const { PROGRESSIVE_CONCEPTS } = await server.ssrLoadModule('/src/curriculum/progressiveCurriculum.ts');
await server.close();

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 800 });

console.log('Auditing curriculum drills for stray measure numbers...');

let totalChecks = 0;
const violations = [];

for (const lesson of PROGRESSIVE_CONCEPTS) {
  for (let slot = 1; slot <= 4; slot++) {
    totalChecks++;
    const url = `${base}/visual-audit.html?lesson=${lesson.index}&slot=${slot}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.et-staff svg', { timeout: 5000 }).catch(() => null);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const measureNumbersFound = await page.evaluate(() => {
      const svgs = document.querySelectorAll('.et-staff svg');
      const found = [];
      for (const svg of svgs) {
        // Check for .measure-number elements
        const mnElements = svg.querySelectorAll('.measure-number, [class*="measure-number"], .vf-text.measure-number');
        if (mnElements.length > 0) {
          for (const el of mnElements) {
            found.push({
              tag: el.tagName,
              text: el.textContent?.trim(),
              class: el.getAttribute('class'),
              display: window.getComputedStyle(el).display,
            });
          }
        }
      }
      return found;
    });

    if (measureNumbersFound.length > 0) {
      violations.push({
        lesson: lesson.index,
        slot,
        measureNumbersFound,
      });
    }
  }
}

await browser.close();

console.log(`Audited ${totalChecks} curriculum drills.`);
if (violations.length > 0) {
  console.error(`FAILED: Found measure number elements in ${violations.length} drills:`, JSON.stringify(violations, null, 2));
  process.exit(1);
} else {
  console.log(`PASSED: 0 measure numbers found across all ${totalChecks} drills.`);
}
