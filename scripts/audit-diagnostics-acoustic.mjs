import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.AUDIT_URL ?? 'http://127.0.0.1:5190'}/?diagnosis=hand-position&key=C&dev=diagnostics`);
  await page.waitForSelector('.diagnostic-flow');
  await page.evaluate(async () => {
    const input = new AudioContext(); await input.resume();
    let destination = input.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => { destination = input.createMediaStreamDestination(); return destination.stream; };
    window.playFixture = (midis, spacing = .8) => {
      const buffer = input.createBuffer(1, Math.ceil((midis.length * spacing + 1) * input.sampleRate), input.sampleRate);
      const samples = buffer.getChannelData(0);
      midis.forEach((midi, index) => {
        const frequency = 440 * 2 ** ((midi - 69) / 12), duration = spacing * .8;
        for (let j = 0; j < duration * input.sampleRate; j++) {
          const age = j / input.sampleRate;
          const envelope = .045 * Math.min(1, age / .025) * Math.exp(-age / .4) * Math.min(1, (duration - age) / .055);
          let value = 0;
          [1, .48, .25, .14, .08, .045].forEach((gain, h) => { const partial = h + 1; value += gain * Math.sin(2 * Math.PI * frequency * partial * Math.sqrt(1 + .00012 * partial * partial) * age); });
          samples[Math.floor(index * spacing * input.sampleRate) + j] += envelope * value;
        }
      });
      const source = input.createBufferSource(); source.buffer = buffer; source.connect(destination); source.start(input.currentTime + .04);
    };
  });
  const click = async text => page.evaluate(text => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled); if (!button) throw Error(`Missing enabled ${text}`); button.click(); }, text);
  await page.keyboard.press('3');
  for (const [stage, midis] of [[3, [60, 62, 64, 65, 67, 65, 64, 60]], [4, [60, 64, 62, 65, 67, 64, 65, 60]]]) {
    await page.waitForSelector(`[data-stage="${stage}"] .et-proof--position-prompt`);
    await click('Start');
    await page.waitForSelector('.et-proof--proving', { timeout: 30000 });
    await page.evaluate(() => window.playFixture([60, 64, 67]));
    await page.waitForSelector('.et-exercise--prompt', { timeout: 15000 });
    await click('Start drill');
    await page.waitForSelector('.et-exercise--listening', { timeout: 30000 });
    await page.evaluate(midis => window.playFixture(midis), midis);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /Try a fresh phrase|Finish practice|Try this phrase again/.test(b.textContent)), { timeout: 30000 });
    const next = stage === 3 ? 'Try a fresh phrase' : 'Finish practice';
    const body = await page.$eval('body', el => el.innerText);
    assert.ok(body.includes(next), `Synthetic microphone take did not pass stage ${stage}: ${body}`);
    await click(next);
  }
  await page.waitForFunction(() => document.body.textContent.includes('You carried the clue into a new phrase!'));
  assert.deepEqual(errors, []);
  console.log('Acoustic integration fixture passed: real useDrillAudio proof, count-in, recognition, grading, stage 3 → transfer → completion. Synthetic input; not an acoustic-device validation.');
} finally { await browser.close(); }
