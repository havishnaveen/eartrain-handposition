import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => { Math.random = () => .01; });
  const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5192';
  await page.goto(`${base}/?diagnosis=octave-displacement&dev=diagnostics`);
  const click = async text => {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === text && !button.disabled), {}, text);
    await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled).click(), text);
  };
  const listen = async () => {
    await click('Play piano example');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Wrong' && !button.disabled), { timeout: 45000 });
  };
  await page.waitForSelector('[aria-label="Question 1 of 5"] svg');
  await listen();
  await click('Correct'); // Deliberately miss once to reveal the pictured feedback.
  await click('Check clue');
  await click('In the 3rd space of the staff');
  assert.equal(await page.$eval('.diagnostic-brief-text--correct', el => el.textContent.trim()), 'Note 1 is C5, in the 5th octave.');
  await click('Try question again');
  for (const [index, answer] of ['Wrong', 'Wrong', 'Correct', 'Wrong', 'Correct'].entries()) {
    await page.waitForSelector(`[aria-label="Question ${index + 1} of 5"] svg`);
    if (index >= 3) {
      for (const width of [320, 1024]) {
        await page.setViewport({ width, height: 1000 });
        await page.waitForFunction(() => document.querySelector('.diagnostic-score svg')?.getBoundingClientRect().height > 30);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.screenshot({ path: `../octave-listening-${index + 1}-${width}.png`, fullPage: true });
      }
      assert.ok(await page.$('.diagnostic-score .vf-beam'), 'Eighth/sixteenth notes must render with beams');
    }
    await listen();
    await click(answer);
    await click(index === 4 ? 'Continue' : 'Next question');
  }
  await page.waitForSelector('[data-stage="2"]');
  await page.keyboard.press('3');
  await page.waitForSelector('[data-stage="3"] .et-exercise--prompt');
  assert.equal(await page.$('.et-proof'), null);
  await page.keyboard.press('4');
  await page.waitForSelector('[data-stage="4"] .et-exercise--prompt');
  assert.equal(await page.$('.et-proof'), null);
  await page.goto(`${base}/?diagnosis=hand-position&dev=diagnostics`);
  await page.waitForSelector('.diagnostic-flow');
  await page.keyboard.press('3');
  await page.waitForSelector('.et-proof--position-prompt');
  assert.deepEqual(errors, []);
  console.log('High Register browser audit passed: short feedback, five mixed-answer rounds, rhythmic notation/playback, and no proof on either octave playthrough. Other lesson proof preserved.');
} finally { await browser.close(); }
