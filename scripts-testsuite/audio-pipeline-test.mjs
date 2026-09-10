// TEST A: Automated Audio Pipeline Test (virtual audio injection).
//
// Drives the REAL, unmodified browser audio pipeline end-to-end: real
// AudioContext -> real AudioWorkletNode (pitch-processor.js) -> real PCM
// capture -> real Basic Pitch ML worker -> real gradeSequence(). The only
// thing replaced is the physical microphone, via a navigator.mediaDevices.
// getUserMedia override installed before any app script runs (see
// inject-init-script.js). No application source file is read from disk and
// modified; this script and its fixtures are the entire, separate test
// harness.
//
// Fixture audio is BEST-EFFORT PHYSICALLY-MODELED SYNTHESIS (see synth.mjs),
// not acoustic recordings -- there was no real piano .wav available and no
// network path to fetch one in this sandbox. The user explicitly approved
// this approach. Every result below is labeled accordingly.
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE_URL = process.env.ET_BASE_URL || 'http://localhost:5173/';
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));
const INIT_SCRIPT = readFileSync(new URL('./inject-init-script.js', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('./injection-manifest.json', import.meta.url), 'utf8'),
);

const SLOT_TIMEOUT_MS = 45000;
const POLL_MS = 120;

function wavBase64(filename) {
  const buf = readFileSync(FIXTURES_DIR + filename);
  return buf.toString('base64');
}

async function readStatus(page) {
  return page.evaluate(() => {
    function statusOf(el, prefix) {
      if (!el) return null;
      const m = el.className.match(new RegExp(prefix + '--(\\S+)'));
      return m ? m[1] : null;
    }
    const proofEl = document.querySelector('[class*="et-proof--"]');
    const spatialEl = document.querySelector('[class*="et-spatial--"]');
    const exerciseEl = document.querySelector('[class*="et-exercise--"]');
    const status =
      statusOf(proofEl, 'et-proof') ||
      statusOf(spatialEl, 'et-spatial') ||
      statusOf(exerciseEl, 'et-exercise');
    const startBtn = document.querySelector('.et-start, .lp__start');
    const reportNextBtn = document.querySelector('.et-report__next');
    const overallEl = document.querySelector('.et-report__overall');
    const micMessage = document.querySelector('.et-proof__mic-message, .et-spatial__audio-issue');
    const orientationBtn = document.querySelector('.et-orientation-tip button');
    // Per-category breakdown (Pitch/Timing/Cleanliness), including whether a
    // category rendered as a hard numeric value or the "Not scored" (null)
    // state -- this is what the "random 0s in random categories" report is
    // actually about, so capture it alongside the aggregate overall score.
    const breakdown = [...document.querySelectorAll('.et-report-score')].map((el) => {
      const label = el.querySelector('h3')?.textContent ?? null;
      const naEl = el.querySelector('.et-report-score__na');
      const strongEl = el.querySelector('strong');
      return {
        label,
        isNotScored: Boolean(naEl),
        value: strongEl ? parseFloat(strongEl.textContent) : null,
      };
    });
    return {
      status,
      hasStart: Boolean(startBtn) && !startBtn.disabled,
      hasReportNext: Boolean(reportNextBtn),
      overallLabel: overallEl ? overallEl.getAttribute('aria-label') : null,
      breakdown,
      micMessage: micMessage ? micMessage.textContent : null,
      hasOrientationTip: Boolean(orientationBtn),
      orientationText: orientationBtn ? orientationBtn.closest('.et-orientation-tip')?.textContent : null,
      title: document.title,
    };
  }).catch(() => null);
}

async function clickIfPresent(page, selector) {
  try {
    const el = await page.$(selector);
    if (el) {
      const box = await el.boundingBox();
      if (box) {
        await el.click({ delay: 10 });
        return true;
      }
    }
  } catch (e) { /* ignore transient detach races */ }
  return false;
}

async function playFixture(page, filename, delaySeconds = 0.05) {
  const b64 = wavBase64(filename);
  return page.evaluate(
    (base64, delay) => window.__ETPlayWav(base64, delay),
    b64,
    delaySeconds,
  );
}

async function runSlot(page, run, slotSpec, findings, log) {
  const label = `lesson${run.lesson}-slot${slotSpec.slot} (${slotSpec.exerciseMode})`;
  log(`--- ${label} ---`);
  const injectionsByKind = Object.fromEntries(slotSpec.injections.map((i) => [i.kind, i]));
  const proofFixtures = injectionsByKind.proof?.proofs ?? [];
  let proofCycleIndex = 0; // which hand/proof we're on -- a "both hands"
  // position proves right hand then left, cycling back through
  // position-prompt -> proving once per proof.
  let prevStatus = null;
  const fired = new Set();
  const actedStatuses = new Set();
  const start = Date.now();
  let result = {
    lesson: run.lesson,
    slot: slotSpec.slot,
    exerciseMode: slotSpec.exerciseMode,
    expectedSequence: slotSpec.expectedSequence,
    overallLabel: null,
    overallScore: null,
    breakdown: null,
    completed: false,
    timedOut: false,
    micMessage: null,
    statusesSeen: [],
  };

  while (Date.now() - start < SLOT_TIMEOUT_MS) {
    const s = await readStatus(page);
    if (!s) { await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
    if (s.status && result.statusesSeen[result.statusesSeen.length - 1] !== s.status) {
      result.statusesSeen.push(s.status);
    }
    if (s.micMessage) result.micMessage = s.micMessage;

    // ExerciseView renders the report/grading screens as their OWN
    // components (ExerciseReport / PerformanceAnalysis) instead of the
    // `.et-exercise et-exercise--${status}` wrapper, so `s.status` is null
    // while they're showing. Detect them independently of the status regex.
    if (s.overallLabel && !result.overallLabel) {
      result.overallLabel = s.overallLabel;
      const m = s.overallLabel.match(/([\d.]+)\s*out of 5/);
      result.overallScore = m ? parseFloat(m[1]) : null;
      result.breakdown = s.breakdown;
    }
    if (s.hasReportNext) {
      await clickIfPresent(page, '.et-report__next');
      result.completed = true;
      break;
    }

    // A pre-exercise orientation/hand-placement callout ("Check each hand",
    // "Left hand", "Both hands", a register warning, etc.) blocks the Start
    // button until acknowledged. It isn't tied to the status regex at all
    // (it overlays whichever screen is showing), so handle it unconditionally
    // on every poll rather than inside the switch below.
    if (s.hasOrientationTip) {
      const clicked = await clickIfPresent(page, '.et-orientation-tip button');
      if (clicked) log(`  acknowledged orientation callout: ${JSON.stringify(s.orientationText)}`);
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }

    switch (s.status) {
      case 'position-prompt': {
        // Re-entered once per proof on a multi-proof ("both hands")
        // position, so this must be clickable again each cycle -- not just
        // the first time this status is ever seen.
        if (s.hasStart) {
          await clickIfPresent(page, '.et-start, .lp__start');
        }
        break;
      }
      case 'proving': {
        if (prevStatus !== 'proving') {
          const proof = proofFixtures[proofCycleIndex];
          if (proof) {
            await playFixture(page, proof.file, 0.1);
            log(`  injected proof audio #${proofCycleIndex} (${proof.file})`);
          } else {
            log(`  !! no fixture for proof cycle ${proofCycleIndex} (only ${proofFixtures.length} built)`);
          }
          proofCycleIndex += 1;
        }
        break;
      }
      case 'prompt': {
        if (!actedStatuses.has('prompt') && s.hasStart) {
          const clicked = await clickIfPresent(page, '.et-start, .lp__start');
          if (clicked) actedStatuses.add('prompt');
        }
        break;
      }
      case 'listening': {
        if (!fired.has('listening') && injectionsByKind.listening) {
          await playFixture(page, injectionsByKind.listening.file, 0.1);
          fired.add('listening');
          log(`  injected main audio (${injectionsByKind.listening.file})`);
        }
        break;
      }
      case 'chord-root': {
        if (!fired.has('spatial') && injectionsByKind.spatial) {
          await playFixture(page, injectionsByKind.spatial.file, 0.1);
          fired.add('spatial');
          log(`  injected spatial-chord audio (${injectionsByKind.spatial.file})`);
        }
        break;
      }
      case 'report': {
        if (s.overallLabel) {
          result.overallLabel = s.overallLabel;
          const m = s.overallLabel.match(/([\d.]+)\s*out of 5/);
          result.overallScore = m ? parseFloat(m[1]) : null;
          result.breakdown = s.breakdown;
        }
        if (s.hasReportNext) {
          await clickIfPresent(page, '.et-report__next');
          result.completed = true;
        }
        break;
      }
      case 'chord-complete': {
        result.completed = true; // spatial-chord marks its own report already
        if (s.hasStart) {
          await clickIfPresent(page, '.et-start, .lp__start');
        }
        break;
      }
      default:
        break;
    }

    prevStatus = s.status;
    if (result.completed) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if (!result.completed) {
    result.timedOut = true;
    log(`  !! TIMED OUT after ${SLOT_TIMEOUT_MS}ms, statuses seen: ${result.statusesSeen.join(' -> ')}`);
  }

  // Judge against the user's stated bug signature.
  if (result.exerciseMode !== 'spatial-chord') {
    if (result.overallScore === null && !result.timedOut) {
      findings.push({
        ...result,
        issue: 'No overall score captured despite reaching the report screen (score text unparsed or missing).',
      });
    } else if (result.overallScore !== null && result.overallScore < 4.5) {
      findings.push({
        ...result,
        issue: `Perfect-performance take scored ${result.overallScore}/5 (< 4.5 pass bar) on a clean, synthesized-but-real-pipeline correct performance.`,
      });
    }
    if (result.overallScore === 1.0) {
      findings.push({
        ...result,
        issue: 'FLATLINE 1.0 SCORE -- matches the user-reported "perfect performance scores 1.0" symptom exactly.',
        severity: 'critical',
      });
    }
  }
  if (result.timedOut) {
    findings.push({ ...result, issue: 'Harness timed out waiting for this slot to resolve (see statusesSeen).' });
  }

  log(`  result: overall=${result.overallLabel ?? 'n/a'} completed=${result.completed} timedOut=${result.timedOut}`);
  return result;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--window-size=1280,900',
    ],
  });

  const allResults = [];
  const allFindings = [];
  const consoleLogLines = [];
  const log = (line) => { console.log(line); consoleLogLines.push(line); };

  try {
    for (const run of manifest.runs) {
      log(`\n=== Lesson ${run.lesson} (freshLoad=${run.freshLoad}) ===`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.evaluateOnNewDocument(INIT_SCRIPT);
      page.on('pageerror', (err) => consoleLogLines.push(`[pageerror] ${err.message}`));

      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Let the dev lesson jumper mount before sending keys.
      await new Promise((r) => setTimeout(r, 600));

      if (!run.freshLoad) {
        for (let i = 1; i < run.lesson; i++) {
          await page.keyboard.press(']');
          await new Promise((r) => setTimeout(r, 220));
        }
        // Settle time for the final remount's AudioContext/getUserMedia call.
        await new Promise((r) => setTimeout(r, 500));
      }

      for (const slotSpec of run.slots) {
        const result = await runSlot(page, run, slotSpec, allFindings, log);
        allResults.push(result);
      }

      const pageLogs = await page.evaluate(() => window.__ET_LOGS__ || []).catch(() => []);
      for (const entry of pageLogs) {
        consoleLogLines.push(`[browser:${entry.level}] lesson${run.lesson}: ${entry.text}`);
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }

  writeFileSync(
    new URL('./audio-pipeline-results.json', import.meta.url),
    JSON.stringify({ results: allResults, findings: allFindings }, null, 2),
  );
  writeFileSync(new URL('./audio-pipeline-console.log', import.meta.url), consoleLogLines.join('\n'));
  console.log(`\n\nDone. ${allResults.length} slots run, ${allFindings.length} findings. See audio-pipeline-results.json`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
