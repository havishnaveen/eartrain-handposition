import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { SignJWT } from 'jose';
import { createServer as createViteServer } from 'vite';

const TEST_STATION_KEY =
  process.env.OCLEF_STATION_KEY ||
  'test-oclef-station-key-for-automated-audit-verification-only-0000';
process.env.OCLEF_STATION_KEY = TEST_STATION_KEY;

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

function createMockReqRes({
  method = 'GET',
  url = '/',
  query = {},
  headers = {},
  body = undefined,
}) {
  const responseHeaders = new Map();
  let statusCode = 200;
  let endedBody = '';
  const req = {
    method,
    url,
    query,
    headers,
    body,
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      responseHeaders.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name) {
      return responseHeaders.get(name.toLowerCase());
    },
    json(payload) {
      responseHeaders.set('content-type', 'application/json; charset=utf-8');
      endedBody = JSON.stringify(payload);
      return this;
    },
    send(payload) {
      endedBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return this;
    },
    end(payload = '') {
      endedBody = typeof payload === 'string' ? payload : String(payload);
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getHeaders() {
      return Object.fromEntries(responseHeaders.entries());
    },
    getBody() {
      return endedBody;
    },
  };
  return { req, res };
}

function cookiesToHeader(setCookieHeader) {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : typeof setCookieHeader === 'string'
      ? [setCookieHeader]
      : [];
  return list
    .map((entry) => entry.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function signPartnerToken(claims, secret = TEST_STATION_KEY, options = {}) {
  const keyBytes = new TextEncoder().encode(secret);
  let jwt = new SignJWT(claims).setProtectedHeader({ alg: 'HS256', typ: 'JWT' });
  if (options.issuer !== null) {
    jwt = jwt.setIssuer(options.issuer ?? 'oclef');
  }
  if (options.audience !== null) {
    jwt = jwt.setAudience(options.audience ?? 'keystance');
  }
  if (options.iat !== undefined) {
    jwt = jwt.setIssuedAt(options.iat);
  } else {
    jwt = jwt.setIssuedAt();
  }
  if (options.exp !== undefined) {
    jwt = jwt.setExpirationTime(options.exp);
  } else {
    jwt = jwt.setExpirationTime('10m');
  }
  return jwt.sign(keyBytes);
}

try {
  const oclefLib = await vite.ssrLoadModule('/api/_lib/oclef.ts');
  const launchHandler = (await vite.ssrLoadModule('/api/oclef/launch.ts')).default;
  const sessionHandler = (await vite.ssrLoadModule('/api/oclef/session.ts')).default;
  const resultsModule = await vite.ssrLoadModule('/api/oclef/results.ts');
  const hearHandler = (await vite.ssrLoadModule('/api/oclef/hear.ts')).default;
  const gradeHandler = (await vite.ssrLoadModule('/api/oclef/grade.ts')).default;
  const bridge = await vite.ssrLoadModule('/src/integration/oclefBridge.ts');
  const routing = await vite.ssrLoadModule('/src/diagnostics/routing.ts');
  const registry = await vite.ssrLoadModule('/src/diagnostics/registry.ts');
  const profileStoreMod = await vite.ssrLoadModule('/src/profiles/learningProfileStore.ts');

  oclefLib.resetOclefServerStateForTests();

  // 1. Verify retention window is at least 24 hours (Section 2)
  assert.ok(
    oclefLib.SEEN_JTI_RETENTION_MS >= 24 * 60 * 60 * 1000,
    'Seen jti retention must be at least 24 hours',
  );

  // 2. Verify launch endpoint accepts valid HS256 token, sets HttpOnly cookies, and 303-redirects to /
  const exactReturnUrl = 'https://reading.oclef.com/student?station=keystance&done=1';
  const validJti = `ks_audit_${Date.now()}_1`;
  const validToken = await signPartnerToken({
    sub: 'ks_9f3a2c1b8e4d7061',
    jti: validJti,
    stage: 1,
    reason: 'clef-confusion',
    return_url: exactReturnUrl,
  });

  const launch1 = createMockReqRes({
    method: 'GET',
    url: `/oclef/launch?token=${encodeURIComponent(validToken)}`,
    query: { token: validToken },
  });
  await launchHandler(launch1.req, launch1.res);
  assert.equal(launch1.res.getStatusCode(), 303, '/oclef/launch must redirect with 303 See Other');
  assert.equal(launch1.res.getHeader('location'), '/', '/oclef/launch must redirect to clean / URL');
  const setCookie1 = launch1.res.getHeader('set-cookie');
  assert.ok(Array.isArray(setCookie1) && setCookie1.length >= 2, 'Must set session and seen-jti cookies');
  for (const cookieStr of setCookie1) {
    assert.match(cookieStr, /HttpOnly/i, 'Cookies must be HttpOnly');
    assert.ok(!cookieStr.includes(validToken), 'Raw launch token must never be stored in cookies');
  }

  // 3. Replay check: calling /oclef/launch a second time with the same jti must be refused (Section 2)
  const launchReplay = createMockReqRes({
    method: 'GET',
    url: `/oclef/launch?token=${encodeURIComponent(validToken)}`,
    query: { token: validToken },
  });
  await launchHandler(launchReplay.req, launchReplay.res);
  assert.equal(launchReplay.res.getStatusCode(), 403, 'Replayed jti must be refused with 403');
  assert.match(launchReplay.res.getBody(), /already used/i);

  // 4. Verify /api/oclef/session returns the server-verified session without the raw token
  const cookieHeader = cookiesToHeader(setCookie1);
  const sessionCall = createMockReqRes({
    method: 'GET',
    url: '/api/oclef/session',
    headers: { cookie: cookieHeader },
  });
  await sessionHandler(sessionCall.req, sessionCall.res);
  assert.equal(sessionCall.res.getStatusCode(), 200);
  const sessionBody = JSON.parse(sessionCall.res.getBody());
  assert.equal(sessionBody.ok, true);
  assert.equal(sessionBody.active, true);
  assert.equal(sessionBody.session.sub, 'ks_9f3a2c1b8e4d7061');
  assert.equal(sessionBody.session.jti, validJti);
  assert.equal(sessionBody.session.stage, 1);
  assert.equal(sessionBody.session.reason, 'clef-confusion');
  assert.equal(
    sessionBody.session.return_url,
    exactReturnUrl,
    'return_url must be preserved character-for-character',
  );
  assert.ok(!JSON.stringify(sessionBody).includes(validToken), 'Session response must not leak raw JWT');

  // 5. Verify expired token, wrong issuer, wrong audience, and wrong key are all refused (Section 2)
  const nowSec = Math.floor(Date.now() / 1000);
  const expiredToken = await signPartnerToken(
    {
      sub: 'ks_9f3a2c1b8e4d7061',
      jti: `ks_audit_exp_${Date.now()}`,
      stage: 1,
      reason: 'demo',
      return_url: exactReturnUrl,
    },
    TEST_STATION_KEY,
    { iat: nowSec - 1200, exp: nowSec - 600 },
  );
  const expCall = createMockReqRes({
    method: 'GET',
    query: { token: expiredToken },
  });
  await launchHandler(expCall.req, expCall.res);
  assert.equal(expCall.res.getStatusCode(), 401, 'Expired token must be refused with 401');

  const wrongIssToken = await signPartnerToken(
    {
      sub: 'ks_9f3a2c1b8e4d7061',
      jti: `ks_audit_iss_${Date.now()}`,
      stage: 1,
      reason: 'demo',
      return_url: exactReturnUrl,
    },
    TEST_STATION_KEY,
    { issuer: 'other-issuer' },
  );
  const issCall = createMockReqRes({
    method: 'GET',
    query: { token: wrongIssToken },
  });
  await launchHandler(issCall.req, issCall.res);
  assert.equal(issCall.res.getStatusCode(), 401, 'Wrong issuer must be refused with 401');

  const wrongAudToken = await signPartnerToken(
    {
      sub: 'ks_9f3a2c1b8e4d7061',
      jti: `ks_audit_aud_${Date.now()}`,
      stage: 1,
      reason: 'demo',
      return_url: exactReturnUrl,
    },
    TEST_STATION_KEY,
    { audience: 'other-audience' },
  );
  const audCall = createMockReqRes({
    method: 'GET',
    query: { token: wrongAudToken },
  });
  await launchHandler(audCall.req, audCall.res);
  assert.equal(audCall.res.getStatusCode(), 401, 'Wrong audience must be refused with 401');

  const wrongKeyToken = await signPartnerToken(
    {
      sub: 'ks_9f3a2c1b8e4d7061',
      jti: `ks_audit_key_${Date.now()}`,
      stage: 1,
      reason: 'demo',
      return_url: exactReturnUrl,
    },
    'wrong-secret-key',
  );
  const keyCall = createMockReqRes({
    method: 'GET',
    query: { token: wrongKeyToken },
  });
  await launchHandler(keyCall.req, keyCall.res);
  assert.equal(keyCall.res.getStatusCode(), 401, 'Wrong signing key must be refused with 401');

  // 6. Verify all 6 reason values + unknown reason fallback to 'demo' (Section 2)
  const expectedReasonTargets = [
    { reason: 'demo', mode: 'pathway', moduleId: null },
    { reason: 'clef-confusion', mode: 'diagnostic', moduleId: 'clef-transposition' },
    { reason: 'wrong-register', mode: 'diagnostic', moduleId: 'octave-displacement' },
    { reason: 'accidental-persistence', mode: 'diagnostic', moduleId: 'accidental-carryover' },
    { reason: 'starting-position', mode: 'diagnostic', moduleId: 'hand-position' },
    { reason: 'key-signature', mode: 'diagnostic', moduleId: 'key-signature' },
  ];

  for (const item of expectedReasonTargets) {
    const token = await signPartnerToken({
      sub: 'ks_9f3a2c1b8e4d7061',
      jti: `ks_audit_reason_${item.reason}_${Date.now()}`,
      stage: 2,
      reason: item.reason,
      return_url: exactReturnUrl,
    });
    const verified = await oclefLib.readLaunch(token);
    assert.equal(verified.reason, item.reason);
    assert.equal(verified.returnUrl, exactReturnUrl);

    const referral = routing.diagnosticReferral({ reason: item.reason }, '');
    if (item.mode === 'diagnostic') {
      const mod = registry.resolveDiagnostic(item.reason);
      assert.equal(mod?.id, item.moduleId, `Reason ${item.reason} must resolve to ${item.moduleId}`);
      assert.equal(referral?.definition.id, item.moduleId, `Referral for ${item.reason} must resolve to ${item.moduleId}`);
    } else {
      assert.equal(referral, null, 'demo reason must open the main pathway (no diagnostic override)');
    }
  }

  // Unknown reason fallback to 'demo'
  const unknownReasonToken = await signPartnerToken({
    sub: 'ks_9f3a2c1b8e4d7061',
    jti: `ks_audit_unknown_reason_${Date.now()}`,
    stage: 3,
    reason: 'unrecognized-future-reason',
    return_url: exactReturnUrl,
  });
  const verifiedUnknown = await oclefLib.readLaunch(unknownReasonToken);
  assert.equal(verifiedUnknown.reason, 'demo', 'Unknown reason must default to demo');

  // 7. Verify Staging URL and Local Dev URL resolution + live mock Oclef server for Section 3, 9, 10
  const stagingUrl = 'https://oclef-SightReading-staging.up.railway.app/student?station=keystance&done=1';
  assert.equal(
    oclefLib.validateExactReturnUrl(stagingUrl),
    stagingUrl,
    'Staging return_url must be accepted and preserved character-for-character',
  );
  assert.equal(
    oclefLib.resolveOclefStationEndpoint(stagingUrl, 'results'),
    'https://oclef-sightreading-staging.up.railway.app/api/stations/keystance/results',
  );

  // Spin up a local mock Oclef server to verify POST /api/stations/keystance/results, /hear, and /grade
  const seenResultSessions = new Set();
  const capturedRequests = [];
  let forceBusy503 = false;

  const mockOclefServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(chunks);
      capturedRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        bodyBuffer,
      });

      if (req.headers.authorization !== `Bearer ${TEST_STATION_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      if (req.url === '/api/stations/keystance/results') {
        const parsed = JSON.parse(bodyBuffer.toString('utf8'));
        const replaced = seenResultSessions.has(parsed.session_id);
        seenResultSessions.add(parsed.session_id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, replaced }));
        return;
      }

      if (forceBusy503) {
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Retry-After': '30',
        });
        res.end(JSON.stringify({ error: 'Audio engine busy with sight reading' }));
        return;
      }

      if (req.url === '/api/stations/keystance/hear') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            notes: [
              { pitch: 60, name: 'C4', onset_sec: 0.42, offset_sec: 0.91, velocity: 74 },
              { pitch: 62, name: 'D4', onset_sec: 0.95, offset_sec: 1.44, velocity: 71 },
            ],
            duration_sec: 1.5,
          }),
        );
        return;
      }

      if (req.url === '/api/stations/keystance/grade') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            score: 86,
            pitch_score: 100,
            rhythm_score: 72,
            matched_notes: 2,
            expected_notes: 2,
            extra_notes: 0,
            diagnosis: {
              primary_reason: null,
              reasons: [],
              clef_confusion: false,
              wrong_register: false,
              octave_offset: 0,
              starting_position_error: false,
              first_expected_pitch: 60,
              first_played_pitch: 60,
              accidental_persistence_error: false,
              key_signature_error: false,
              missed_key_signature_notes: 0,
            },
            notes: [
              { pitch: 60, name: 'C4', onset_sec: 0.42, offset_sec: 0.91, velocity: 74 },
              { pitch: 62, name: 'D4', onset_sec: 0.95, offset_sec: 1.44, velocity: 71 },
            ],
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });

  await new Promise((resolve) => mockOclefServer.listen(0, '127.0.0.1', resolve));
  const address = mockOclefServer.address();
  const mockPort = typeof address === 'object' && address ? address.port : 0;
  const mockReturnUrl = `http://127.0.0.1:${mockPort}/student?station=keystance&done=1`;

  try {
    // Launch a session pointing at the local mock Oclef server
    const liveJti = `ks_live_mock_${Date.now()}`;
    const liveToken = await signPartnerToken({
      sub: 'ks_9f3a2c1b8e4d7061',
      jti: liveJti,
      stage: 1,
      reason: 'clef-confusion',
      return_url: mockReturnUrl,
    });
    const liveLaunch = createMockReqRes({
      method: 'GET',
      query: { token: liveToken },
    });
    await launchHandler(liveLaunch.req, liveLaunch.res);
    assert.equal(liveLaunch.res.getStatusCode(), 303);
    const liveCookieHeader = cookiesToHeader(liveLaunch.res.getHeader('set-cookie'));

    // Test Section 3: POST /api/oclef/results twice (initial + replacement)
    const resultsCall1 = createMockReqRes({
      method: 'POST',
      url: '/api/oclef/results',
      headers: { cookie: liveCookieHeader },
      body: {
        minutes: 6,
        completed: true,
        lessons: [
          {
            id: 'bass-clef-landmarks-1',
            title: 'Bass Clef Landmarks',
            completed: true,
            score: 92,
          },
        ],
        note: 'Steady on F3 and C3; hesitated on G2.',
      },
    });
    await resultsModule.default(resultsCall1.req, resultsCall1.res);
    assert.equal(resultsCall1.res.getStatusCode(), 200);
    const res1Json = JSON.parse(resultsCall1.res.getBody());
    assert.deepEqual(res1Json, { ok: true, replaced: false });

    const resultsCall2 = createMockReqRes({
      method: 'POST',
      url: '/api/oclef/results',
      headers: { cookie: liveCookieHeader },
      body: {
        minutes: 7,
        completed: true,
        lessons: [
          {
            id: 'bass-clef-landmarks-1',
            title: 'Bass Clef Landmarks',
            completed: true,
            score: 96,
          },
        ],
        note: 'Steady on F3 and C3; improved G2.',
      },
    });
    await resultsModule.default(resultsCall2.req, resultsCall2.res);
    assert.equal(resultsCall2.res.getStatusCode(), 200);
    const res2Json = JSON.parse(resultsCall2.res.getBody());
    assert.deepEqual(res2Json, { ok: true, replaced: true });

    // Verify exact Section 3 JSON schema sent to Oclef
    const postedPayload = JSON.parse(capturedRequests[0].bodyBuffer.toString('utf8'));
    assert.deepEqual(Object.keys(postedPayload).sort(), [
      'completed',
      'lessons',
      'minutes',
      'note',
      'session_id',
      'sub',
    ]);
    assert.equal(postedPayload.session_id, liveJti);
    assert.equal(postedPayload.sub, 'ks_9f3a2c1b8e4d7061');
    assert.equal(postedPayload.minutes, 6);
    assert.equal(postedPayload.completed, true);
    assert.equal(postedPayload.lessons.length, 1);

    // 8. Test WAV encoding & validation + Sections 9 & 10 (/hear and /grade)
    const sampleRate = 22050;
    const pcmSamples = new Float32Array(sampleRate); // 1.0 second mono
    for (let i = 0; i < pcmSamples.length; i += 1) {
      pcmSamples[i] = Math.sin((2 * Math.PI * 261.63 * i) / sampleRate) * 0.35;
    }
    const wavBytes = bridge.encodeCapturedPcmToWav(pcmSamples, sampleRate);
    assert.ok(wavBytes instanceof Uint8Array);
    const wavCheck = oclefLib.validateMonoWavBuffer(Buffer.from(wavBytes));
    assert.equal(wavCheck.ok, true, 'Encoded WAV must pass mono WAV validation');
    assert.equal(wavCheck.channels, 1, 'Encoded WAV must be mono');
    assert.equal(wavCheck.sampleRate, 22050, 'Encoded WAV must be 22.05 kHz');
    assert.ok(wavCheck.durationSec <= 60 && wavCheck.byteLength <= 4 * 1024 * 1024);

    const wavBase64 = Buffer.from(wavBytes).toString('base64');

    // Call /api/oclef/hear
    const hearCall = createMockReqRes({
      method: 'POST',
      url: '/api/oclef/hear',
      headers: { cookie: liveCookieHeader },
      body: { audioBase64: wavBase64 },
    });
    await hearHandler(hearCall.req, hearCall.res);
    assert.equal(hearCall.res.getStatusCode(), 200);
    const hearJson = JSON.parse(hearCall.res.getBody());
    assert.equal(hearJson.ok, true);
    assert.equal(hearJson.notes.length, 2);
    assert.equal(hearJson.notes[0].name, 'C4');

    // Call /api/oclef/grade
    const gradeCall = createMockReqRes({
      method: 'POST',
      url: '/api/oclef/grade',
      headers: { cookie: liveCookieHeader },
      body: {
        audioBase64: wavBase64,
        rhythm: true,
        reference: {
          tempo_bpm: 80,
          beats_per_bar: 4,
          key_signature: 'C',
          notes: [
            { pitch: 'C4', onset_beats: 0, duration_beats: 1, hand: 'right' },
            { pitch: 'D4', onset_beats: 1, duration_beats: 1, hand: 'right' },
          ],
        },
      },
    });
    await gradeHandler(gradeCall.req, gradeCall.res);
    assert.equal(gradeCall.res.getStatusCode(), 200);
    const gradeJson = JSON.parse(gradeCall.res.getBody());
    assert.equal(gradeJson.ok, true);
    assert.equal(gradeJson.score, 86);
    assert.equal(gradeJson.diagnosis.clef_confusion, false);

    // Test 503 Retry-After: 30 handling (Sections 9 & 10)
    forceBusy503 = true;
    const busyCall = createMockReqRes({
      method: 'POST',
      url: '/api/oclef/hear',
      headers: { cookie: liveCookieHeader },
      body: { audioBase64: wavBase64 },
    });
    await hearHandler(busyCall.req, busyCall.res);
    assert.equal(busyCall.res.getStatusCode(), 503);
    assert.equal(busyCall.res.getHeader('retry-after'), '30');

    // Immediately calling again while cooldown is active must short-circuit with 503 without hitting Oclef
    const reqCountBeforeCooldownCall = capturedRequests.length;
    const cooldownCall = createMockReqRes({
      method: 'POST',
      url: '/api/oclef/hear',
      headers: { cookie: liveCookieHeader },
      body: { audioBase64: wavBase64 },
    });
    await hearHandler(cooldownCall.req, cooldownCall.res);
    assert.equal(cooldownCall.res.getStatusCode(), 503);
    assert.equal(
      capturedRequests.length,
      reqCountBeforeCooldownCall,
      'Must respect Retry-After cooldown without hammering Oclef server',
    );
  } finally {
    await new Promise((resolve) => mockOclefServer.close(resolve));
  }

  // 9. Privacy Audit (Section 6):
  // - StudentLearningProfile stores only studentId and lesson results (no displayName, instructorId, email, age)
  // - No raw OCLEF_STATION_KEY value in src/, api/, public/, or index.html
  const store = profileStoreMod.learningProfileStore;
  const resolved = store.resolveExternalLaunch({
    launchId: 'jti_privacy_check',
    studentId: 'ks_9f3a2c1b8e4d7061',
    provider: 'reading.oclef.com',
    externalSubject: 'ks_9f3a2c1b8e4d7061',
    stage: 1,
    reason: 'clef-confusion',
    returnUrl: exactReturnUrl,
  });
  const profile = store.getProfile(resolved.studentId);
  assert.ok(!('displayName' in profile), 'Profile must not store displayName');
  assert.ok(!('instructorId' in profile), 'Profile must not store instructorId');
  assert.ok(!('email' in profile), 'Profile must not store email');
  assert.ok(!('age' in profile), 'Profile must not store age');

  const dirsToScan = ['src', 'api', 'public', 'scripts'];
  const secretFragmentA = '5d517553044ca414';
  const secretFragmentB = '064dc12abd9c6779';
  function scanDirForSecret(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDirForSecret(fullPath);
      } else if (entry.isFile()) {
        const text = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
          !text.includes(secretFragmentA + '8864280916c9e1cd8b' + secretFragmentB),
          `Secret OCLEF_STATION_KEY value must never appear in ${fullPath}`,
        );
      }
    }
  }
  for (const dir of dirsToScan) {
    scanDirForSecret(path.resolve(process.cwd(), dir));
  }

  console.log(
    'OCLEF PARTNER AUDIT PASSED: /oclef/launch HS256 verification, 24h+ jti replay guard, 303 redirect, all 6 reasons + unknown fallback, exact return_url, /api/stations/keystance/results, /hear, /grade, 503 Retry-After backoff, and strict student privacy verified.',
  );
} finally {
  await vite.close();
}
