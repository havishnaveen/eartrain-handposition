import crypto from 'node:crypto';

const OCLEF_STATION_KEY = process.env.OCLEF_STATION_KEY || '';
const OCLEF_UPSTREAM_EXCHANGE_URL = process.env.OCLEF_UPSTREAM_EXCHANGE_URL || '';

function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, X-Oclef-Station-Key, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  );
  res.setHeader('Cache-Control', 'no-store');
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signHmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function deterministicUuid(namespace: string, value: string): string {
  const hash = crypto.createHash('sha256').update(`${namespace}:${value}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function decodeSignedHandoff(token: string, secret: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length === 3) {
    // JWT format: header.payload.signature
    const [headerB64, payloadB64, sigB64] = parts;
    const expectedSig = signHmac(`${headerB64}.${payloadB64}`, secret);
    const expectedHexSig = crypto
      .createHmac('sha256', Buffer.from(secret, 'hex').length === 32 ? Buffer.from(secret, 'hex') : secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (!timingSafeEqualStr(sigB64, expectedSig) && !timingSafeEqualStr(sigB64, expectedHexSig)) {
      return null;
    }
    try {
      return JSON.parse(base64UrlDecode(payloadB64));
    } catch {
      return null;
    }
  }
  if (parts.length === 2) {
    // Compact format: payloadB64.signature (base64url or hex)
    const [payloadB64, sig] = parts;
    const expectedB64 = signHmac(payloadB64, secret);
    const expectedHex = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
    const rawKey = Buffer.from(secret, 'hex').length === 32 ? Buffer.from(secret, 'hex') : secret;
    const expectedRawB64 = crypto.createHmac('sha256', rawKey).update(payloadB64).digest('base64url');
    const expectedRawHex = crypto.createHmac('sha256', rawKey).update(payloadB64).digest('hex');
    if (
      !timingSafeEqualStr(sig, expectedB64) &&
      !timingSafeEqualStr(sig, expectedHex) &&
      !timingSafeEqualStr(sig, expectedRawB64) &&
      !timingSafeEqualStr(sig, expectedRawHex)
    ) {
      return null;
    }
    try {
      return JSON.parse(base64UrlDecode(payloadB64));
    } catch {
      return null;
    }
  }
  return null;
}

function buildResolvedLaunch(claims: Record<string, any>) {
  const externalSubject = String(
    claims.externalSubject ?? claims.sub ?? claims.studentId ?? claims.student_id ?? 'oclef-student',
  );
  const studentId =
    typeof claims.studentId === 'string' && claims.studentId.length >= 8
      ? claims.studentId
      : deterministicUuid('student', externalSubject);
  const instructorSubject = String(
    claims.instructorId ?? claims.instructor_id ?? claims.teacherId ?? claims.teacher_id ?? 'oclef-instructor',
  );
  const instructorId =
    typeof claims.instructorId === 'string' && claims.instructorId.length >= 8
      ? claims.instructorId
      : deterministicUuid('instructor', instructorSubject);

  const rawProblem =
    claims.assignment?.problem ??
    claims.problem ??
    claims.diagnosticCode ??
    claims.diagnosticReason ??
    claims.topic ??
    claims.station;

  const rawKey = claims.assignment?.key ?? claims.key;
  const returnUrl = claims.assignment?.returnUrl ?? claims.returnUrl ?? claims.return_url;

  const assignment =
    typeof rawProblem === 'string' && rawProblem.trim()
      ? {
          id: String(claims.assignment?.id ?? claims.assignmentId ?? `assign_${deterministicUuid('assign', `${studentId}:${rawProblem}`).slice(0, 12)}`),
          problem: rawProblem.trim(),
          ...(typeof rawKey === 'string' && rawKey.trim() ? { key: rawKey.trim() } : {}),
          recommendedLessonIndex: Number.isInteger(Number(claims.assignment?.recommendedLessonIndex ?? claims.recommendedLessonIndex))
            ? Math.min(24, Math.max(1, Number(claims.assignment?.recommendedLessonIndex ?? claims.recommendedLessonIndex)))
            : 1,
          ...(Number.isInteger(Number(claims.assignment?.questionCap ?? claims.questionCap)) &&
          Number(claims.assignment?.questionCap ?? claims.questionCap) > 0
            ? { questionCap: Math.min(216, Number(claims.assignment?.questionCap ?? claims.questionCap)) }
            : {}),
          ...(typeof returnUrl === 'string' && returnUrl.trim() ? { returnUrl: returnUrl.trim() } : {}),
        }
      : null;

  return {
    launchId: String(claims.launchId ?? claims.jti ?? `launch_${crypto.randomUUID()}`),
    studentId,
    instructorId,
    displayName: String(claims.displayName ?? claims.name ?? claims.studentName ?? 'Oclef Student').slice(0, 120),
    provider: 'reading.oclef.com' as const,
    externalSubject,
    sourceApp: 'reading.oclef.com' as const,
    assignment,
    ...(typeof claims.diagnosticReason === 'string' ? { diagnosticReason: claims.diagnosticReason } : {}),
    ...(typeof claims.diagnosticCode === 'string' ? { diagnosticCode: claims.diagnosticCode } : {}),
    ...(typeof rawKey === 'string' && rawKey.trim() ? { key: rawKey.trim() } : {}),
    checkpoint: claims.checkpoint ?? null,
  };
}

function issueSyncToken(launch: ReturnType<typeof buildResolvedLaunch>, expiresAt: number, secret: string): string {
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: launch.studentId,
      launchId: launch.launchId,
      externalSubject: launch.externalSubject,
      assignmentId: launch.assignment?.id ?? null,
      exp: expiresAt,
      iss: 'keystance-web',
    }),
  );
  const signature = signHmac(payload, secret);
  return `ks1.${payload}.${signature}`;
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'keystance-oclef-exchange',
      configured: Boolean(OCLEF_STATION_KEY),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!OCLEF_STATION_KEY) {
    return res.status(503).json({ error: 'OCLEF_STATION_KEY is not configured on the server.' });
  }

  const { handoff, audience, curriculumId } = req.body ?? {};
  if (typeof handoff !== 'string' || handoff.trim().length < 8) {
    return res.status(400).json({ error: 'Missing or invalid handoff code.' });
  }

  const trimmedHandoff = handoff.trim();
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2 hours

  // 1. Check if the handoff code is a signed token (JWT or compact HMAC signed with OCLEF_STATION_KEY)
  const localClaims = decodeSignedHandoff(trimmedHandoff, OCLEF_STATION_KEY);
  if (localClaims) {
    if (localClaims.exp && Number(localClaims.exp) * (localClaims.exp < 1e12 ? 1000 : 1) <= Date.now()) {
      return res.status(401).json({ error: 'Handoff token has expired.' });
    }
    const launch = buildResolvedLaunch(localClaims);
    const syncToken = issueSyncToken(launch, expiresAt, OCLEF_STATION_KEY);
    return res.status(200).json({
      launch,
      syncToken,
      expiresAt,
      ingestUrl: '/api/integration/oclef/events',
    });
  }

  // 2. Otherwise, redeem opaque handoff code against Oclef upstream if reachable
  const upstreamUrl = OCLEF_UPSTREAM_EXCHANGE_URL || 'https://reading.oclef.com/api/station/exchange';
  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OCLEF_STATION_KEY}`,
        'X-Oclef-Station-Key': OCLEF_STATION_KEY,
      },
      body: JSON.stringify({
        handoff: trimmedHandoff,
        audience: audience || 'keystance-web',
        curriculumId: curriculumId || 'keystance-position-pathway',
      }),
    });

    if (upstreamRes.ok) {
      const data: any = await upstreamRes.json();
      const rawLaunch = data.launch ?? data;
      const launch = buildResolvedLaunch(rawLaunch);
      const resolvedExpiresAt = Number(data.expiresAt) > Date.now() + 5_000 ? Number(data.expiresAt) : expiresAt;
      const syncToken =
        typeof data.syncToken === 'string' && data.syncToken.length >= 16
          ? data.syncToken
          : issueSyncToken(launch, resolvedExpiresAt, OCLEF_STATION_KEY);
      return res.status(200).json({
        launch,
        syncToken,
        expiresAt: resolvedExpiresAt,
        ingestUrl: typeof data.ingestUrl === 'string' ? data.ingestUrl : '/api/integration/oclef/events',
      });
    }
  } catch (err) {
    console.error('Oclef upstream exchange error:', err);
  }

  return res.status(401).json({ error: 'Handoff code could not be verified.' });
}
