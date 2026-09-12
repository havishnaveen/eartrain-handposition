import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5190';
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const clickText = async text => {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.includes(text) && !b.disabled), {}, text);
    await page.evaluate(text => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(text) && !b.disabled); button.click(); }, text);
  };
  if (process.env.PRODUCTION_AUDIT === '1') {
    await page.goto(`${base}/?diagnosis=hand-position`);
    await page.waitForSelector('.diagnostic-flow');
    assert.equal(await page.$('.diagnostic-navigator'), null, 'Production must hide the tester without opt-in');
    await page.goto(`${base}/?dev=diagnostics`);
    await page.waitForSelector('.diagnostic-navigator');
    assert.equal(await page.$('.diagnostic-flow'), null, 'No referral must preserve the standard curriculum');
    assert.equal(await page.evaluate(() => document.body.textContent.includes('DEV — Lesson')), false);
    console.log('Production visibility audit passed: standard fallback, hidden tester by default, explicit tester flag, no retired jumper.');
    process.exitCode = 0;
  } else {
  const problems = ['clef-transposition', 'octave-displacement', 'accidental-carryover', 'hand-position', 'mid-line-clef-change', 'cross-over-under'];
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 1000 });
    for (const problem of problems) {
      await page.goto(`${base}/?diagnosis=${problem}&dev=diagnostics&key=F%23%20minor`);
      await page.waitForSelector('.diagnostic-score svg');
      await page.waitForFunction(() => document.querySelector('.diagnostic-score svg')?.getBoundingClientRect().height > 30);
      assert.equal(await page.$eval('.diagnostic-flow', el => el.dataset.diagnostic), problem);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${problem} overflow at ${width}`);
    }
  }
  await page.goto(`${base}/?diagnosis=octave-displacement&dev=diagnostics`);
  await page.waitForSelector('.diagnostic-score svg');
  await page.screenshot({ path: '../octave-desktop.png', fullPage: true });
  await clickText('Play piano example');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Spot the Mistake' && !b.disabled), { timeout: 45000 });
  await clickText('Spot the Mistake');
  await clickText('Discover the clue');
  await page.waitForSelector('[data-stage="2"]');
  await clickText('Diagnostic tester');
  await clickText('2: Child MCQ');
  await page.waitForSelector('[data-stage="2"]');
  await clickText('The page number.');
  assert.equal(await page.$eval('.diagnostic-flow', el => el.dataset.stage), '2');
  await clickText('The little 8va dashed line!');
  await clickText('Try it on your piano');
  await page.waitForSelector('[data-stage="3"] .et-proof--position-prompt');
  assert.equal(await page.evaluate(() => document.body.textContent.includes('Start')), true);
  // Tester stage jump must still enter the physical proof gate.
  await clickText('4: Transfer Drill');
  await page.waitForSelector('[data-stage="4"] .et-proof--position-prompt');
  await clickText('Return to Standard Curriculum');
  assert.equal(await page.$('.diagnostic-flow'), null);
  await page.keyboard.press('2');
  await page.waitForSelector('[data-stage="2"]');
  await page.goto(`${base}/?diagnosis=hand-position&key=B%20major&dev=diagnostics`);
  await clickText('Diagnostic tester');
  await page.waitForFunction(() => [...document.querySelectorAll('select')].some(select => select.options.length === 24));
  await clickText('2: Child MCQ');
  await page.setViewport({ width: 320, height: 850 });
  await page.screenshot({ path: '../key-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  // A failed sample fetch must keep judgment disabled.
  await page.setRequestInterception(true);
  page.on('request', request => { if (request.url().includes('gleitz.github.io')) request.abort(); else request.continue(); });
  await page.goto(`${base}/?diagnosis=clef-transposition`);
  await page.waitForSelector('.diagnostic-score svg');
  await clickText('Play piano example');
  await page.waitForFunction(() => document.body.textContent.includes('could not load'), { timeout: 30000 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Sounds Right').disabled), true);
  assert.deepEqual(errors, []);
  console.log('Browser audit passed: six problem renderers at four widths, MCQ progression, physical gates, tester navigation, 24-key menu, audio failure handling.');
  }
} finally { await browser.close(); }
