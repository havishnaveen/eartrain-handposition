#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REPO_OWNER = 'havishnaveen';
const REPO_NAME = 'eartrain-handposition';
const LOG_DIR = path.join(REPO_ROOT, 'logs');
const ALERTS_FILE = path.join(LOG_DIR, 'alerts-pending.json');

const isDryRun = process.argv.includes('--dry-run');

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function notifyMacOS(title, message) {
  try {
    const escapedMsg = message.replace(/"/g, '\\"');
    const escapedTitle = title.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escapedMsg}" with title "${escapedTitle}" sound name "default"'`);
    log(`Desktop notification sent: "${title} - ${message}"`);
  } catch (err) {
    log(`Could not send macOS notification: ${err.message}`);
  }
}

async function fetchOpenProblemReports() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=problem-report&state=open`;
  log(`Fetching open problem reports from GitHub API: ${url}`);
  
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'EarTrain-Morning-Triage/1.0',
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
  }
  const issues = await res.json();
  return issues;
}

function classifyIssue(issue) {
  const body = (issue.body || '').toLowerCase();
  const title = (issue.title || '').toLowerCase();
  const text = `${title}\n${body}`;

  // 1. Check for broad/subjective complaints
  const subjectiveKeywords = [
    'app is horrible', 'horrible', 'terrible', 'rewrite', 'start over',
    'garbage', 'waste of time', 'trash', 'unusable'
  ];
  const isSubjective = subjectiveKeywords.some(kw => text.includes(kw));

  // 2. Check for timing / tempo score complaints
  const isTimingRelated = text.includes('timing') || text.includes('off beat') || text.includes('tempo') || text.includes('score is too low');

  // 3. Check for grading / pitch detection complaints
  const isGradingRelated = text.includes('grading') || text.includes('wrong note') || text.includes('said i played') || text.includes('detected wrong');

  // 4. Extract lesson / drill details if present
  let lessonInfo = 'Unknown lesson';
  const lessonMatch = issue.body?.match(/EarTrain issue — (Lesson \d+[^,\n]*)/i) || issue.body?.match(/(Lesson \d+[^,\n]*)/i);
  if (lessonMatch) {
    lessonInfo = lessonMatch[1].trim();
  }

  return {
    number: issue.number,
    title: issue.title,
    author: issue.user?.login,
    isSubjective,
    isTimingRelated,
    isGradingRelated,
    lessonInfo,
    rawBody: issue.body,
    htmlUrl: issue.html_url,
  };
}

function loadAlertsHistory() {
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    }
  } catch (err) {
    log(`Failed to read ${ALERTS_FILE}: ${err.message}`);
  }
  return { timingSlipsByExercise: {}, escalatedIssues: [] };
}

function saveAlertsHistory(history) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    log(`Failed to write ${ALERTS_FILE}: ${err.message}`);
  }
}

async function main() {
  log('========================================================');
  log(`EarTrain Morning Triage Started ${isDryRun ? '(DRY RUN)' : ''}`);
  log('========================================================');

  let issues = [];
  try {
    issues = await fetchOpenProblemReports();
  } catch (err) {
    log(`ERROR: Could not retrieve issues: ${err.message}`);
    process.exit(1);
  }

  log(`Found ${issues.length} open issue(s) with 'problem-report' label.`);

  if (issues.length === 0) {
    log('No open problem reports found. Everything is clean.');
    log('EarTrain Morning Triage Finished Successfully.');
    return;
  }

  const history = loadAlertsHistory();
  const pendingActions = [];

  for (const issue of issues) {
    const classified = classifyIssue(issue);
    log(`--- Inspecting Issue #${classified.number}: "${classified.title}" by @${classified.author} ---`);
    log(`    Exercise: ${classified.lessonInfo}`);

    // Rule 1: Subjective complaints
    if (classified.isSubjective) {
      log(`    [POLICY: IGNORE/CLOSE] Subjective/broad feedback detected. No code modification permitted.`);
      continue;
    }

    // Rule 2: Timing slips
    if (classified.isTimingRelated) {
      const exKey = classified.lessonInfo;
      history.timingSlipsByExercise[exKey] = (history.timingSlipsByExercise[exKey] || 0) + 1;
      const count = history.timingSlipsByExercise[exKey];
      log(`    Timing slip count for [${exKey}]: ${count}`);

      if (count < 3) {
        log(`    [POLICY: IGNORE] Isolated timing slip #${count} on ${exKey}. No code change.`);
      } else {
        log(`    [POLICY: ESCALATE] ${count} timing slips reported on ${exKey}! DO NOT auto-fix.`);
        const alertMsg = `Repeated timing complaints (${count}) on ${exKey}. Needs Havish review.`;
        pendingActions.push({ type: 'timing-escalation', issue: classified, message: alertMsg });
        notifyMacOS('EarTrain Alert: Repeated Timing Issues', alertMsg);
      }
      continue;
    }

    // Rule 3: Grading / Pitch Recognition issues
    if (classified.isGradingRelated) {
      log(`    [POLICY: FORENSIC REVIEW REQUIRED] Grading complaint on ${classified.lessonInfo}.`);
      log(`    Review student playthrough diagnostics carefully to determine if student erred or grading erred.`);
      const alertMsg = `Grading complaint on ${classified.lessonInfo} (#${classified.number}). Playthrough review required before changes.`;
      pendingActions.push({ type: 'grading-review', issue: classified, message: alertMsg });
      notifyMacOS('EarTrain Alert: Grading Review', alertMsg);
      continue;
    }

    // Rule 4: Other / Deterministic bug
    log(`    [POLICY: ESCALATE/REVIEW] Specific issue #${classified.number} needs verification.`);
    pendingActions.push({ type: 'general-review', issue: classified, message: `New problem report #${classified.number} on ${classified.lessonInfo}` });
  }

  saveAlertsHistory(history);

  log('--------------------------------------------------------');
  log(`Triage Summary: ${pendingActions.length} item(s) flagged for attention.`);
  for (const item of pendingActions) {
    log(`  * [${item.type.toUpperCase()}] ${item.message} (${item.issue.htmlUrl})`);
  }
  log('========================================================');
  log('EarTrain Morning Triage Finished.');
}

main().catch(err => {
  console.error('Fatal error in morning triage:', err);
  process.exit(1);
});
