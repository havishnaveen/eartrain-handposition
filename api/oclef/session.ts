import {
  clearSessionCookie,
  isHttpsRequest,
  resolveVisitFromRequest,
} from '../_lib/oclef.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookie(isHttpsRequest(req)));
    return res.status(200).json({ ok: true, active: false, session: null });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resolved = await resolveVisitFromRequest(req);
  if (!resolved) {
    return res.status(200).json({
      ok: true,
      active: false,
      session: null,
    });
  }

  const { visit, rawToken } = resolved;
  return res.status(200).json({
    ok: true,
    active: true,
    session: {
      sub: visit.sub,
      jti: visit.jti,
      sessionId: visit.jti,
      stage: visit.stage,
      reason: visit.reason,
      return_url: visit.return_url,
      returnUrl: visit.return_url,
      startedAt: visit.started_at,
      expiresAt: visit.expires_at,
      syncToken: rawToken,
    },
  });
}
