import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const messages = [];
  page.on('console', async message => {
    if (message.text().includes('[proof-audio]')) messages.push(await Promise.all(message.args().map(arg => arg.jsonValue())));
  });
  page.on('pageerror', error => messages.push(String(error)));
  await page.goto(`${process.env.AUDIT_URL ?? 'http://127.0.0.1:5187'}/?debugAudio=1`);
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useDrillAudio } = await import('/src/audio/useDrillAudio.ts');
    const input = new AudioContext();
    await input.resume();
    const destination = input.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    window.playTestNotes = (midis, spacing = .8, amplitude = .025) => {
      const start = input.currentTime + .2;
      const buffer = input.createBuffer(1, Math.ceil((midis.length * spacing + 1) * input.sampleRate), input.sampleRate);
      const samples = buffer.getChannelData(0);
      midis.forEach((midi, index) => {
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        const duration = spacing * .8;
        for (let j = 0; j < duration * input.sampleRate; j++) {
          const age = j / input.sampleRate;
          const envelope = amplitude * Math.min(1, age / .009) * Math.exp(-age / .4) * Math.min(1, (duration - age) / .055);
          let value = 0;
          [1, .48, .25, .14, .08, .045].forEach((gain, h) => {
            const partial = h + 1;
            value += gain * Math.sin(2 * Math.PI * frequency * partial * Math.sqrt(1 + .00012 * partial * partial) * age);
          });
          samples[Math.floor(index * spacing * input.sampleRate) + j] += envelope * value;
        }
      });
      const source = input.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      source.start(start);
    };
    window.proofSuccess = 0;
    function Harness() {
      window.proofAudio = useDrillAudio({ onProofSuccess: () => window.proofSuccess++ });
      return null;
    }
    const host = document.createElement('div');
    document.body.append(host);
    createRoot(host).render(React.createElement(Harness));
  });
  await page.waitForFunction(() => Boolean(window.proofAudio));
  const results = [];
  for (const [pitches, midis, amplitude, expectedProgress] of [
    [['C4','E4','G4'], [60,64,67], .001, 3],
    [['C4','E4','G4'], [60,64,67], .025, 3],
    [['C4','E4','G4'], [60,64,67], .001, 3],
    [['C3','E3','G3'], [48,52,55], .001, 3],
    [['B4','D#5','F#5'], [71,75,78], .001, 3],
    [['C4','E4','G4'], [61,65,68], .025, 0],
    [['C4','E4','G4'], [48,52,55], .025, 0],
    [['C4','E4','G4'], [], 0, 0],
  ]) {
    const before = await page.evaluate(() => window.proofSuccess);
    const started = await page.evaluate(pitches => window.proofAudio.beginProof({ proofNotes: pitches.map(pitch => ({pitch})), requireHeld: false }), pitches);
    assert.equal(started, true, 'Proof must start');
    await page.evaluate(({midis, amplitude}) => window.playTestNotes(midis, .8, amplitude), {midis, amplitude});
    await new Promise(resolve => setTimeout(resolve, 3500));
    const result = await page.evaluate(({pitches, amplitude, before}) => ({ pitches, amplitude, complete: window.proofSuccess === before + 1, progress: window.proofAudio.proofProgress }), {pitches, amplitude, before});
    results.push({...result, expectedProgress});
  }
  const passed = results.every(result => result.progress === result.expectedProgress && result.complete === (result.expectedProgress === 3));
  console.log(JSON.stringify(passed ? {results} : {results, messages}, null, 2));
  assert.ok(passed, 'Real Prove It must accept correct notes, reject wrong keys/octaves and stay idle in silence');
} finally {
  await browser.close();
}
