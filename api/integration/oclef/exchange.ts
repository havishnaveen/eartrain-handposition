import {
  buildSeenJtisCookie,
  buildSessionCookie,
  getStationKeyString,
  isHttpsRequest,
  issueInternalVisitToken,
  readLaunch,
} from '../../_lib/oclef.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'keystance-oclef-exchange',
      configured: Boolean(getStationKeyString()),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!getStationKeyString()) {
    return res.status(503).json({ error: 'OCLEF_STATION_KEY is not configured on the server.' });
  }

  const rawToken = String(req.body?.token ?? req.body?.handoff ?? '').trim();
  if (!rawToken) {
    return res.status(400).json({ error: 'Missing token.' });
  }

  try {
    const verified = await readLaunch(rawToken, {
      cookieHeader: req.headers?.cookie,
    });
    const secure = isHttpsRequest(req);
    const { token: syncToken, visit } = await issueInternalVisitToken(verified);

    res.setHeader('Set-Cookie', [
      buildSessionCookie(syncToken, secure),
      buildSeenJtisCookie(verified.jti, req.headers?.cookie, secure),
    ]);

    return res.status(200).json({
      launch: {
        launchId: visit.jti,
        studentId: visit.sub,
        provider: 'reading.oclef.com',
        externalSubject: visit.sub,
        sourceApp: 'reading.oclef.com',
        stage: visit.stage,
        reason: visit.reason,
        return_url: visit.return_url,
        diagnosticReason: visit.reason !== 'demo' ? visit.reason : undefined,
        assignment: {
          id: visit.jti,
          problem: visit.reason,
          returnUrl: visit.return_url,
        },
      },
      syncToken,
      expiresAt: visit.expires_at,
      ingestUrl: '/api/oclef/results',
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    const isReplay = message.includes('already used');
    return res.status(isReplay ? 403 : 401).json({
      error: isReplay ? 'This link was already used' : 'Token could not be verified or has expired',
    });
  }
}
