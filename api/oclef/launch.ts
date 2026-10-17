import {
  buildSeenJtisCookie,
  buildSessionCookie,
  getStationKeyString,
  isHttpsRequest,
  issueInternalVisitToken,
  readLaunch,
} from '../_lib/oclef.js';

function renderRefusedHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>${title} · KeyStance</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #faf7f2;
      color: #242237;
      padding: 24px;
    }
    main {
      max-width: 440px;
      background: #ffffff;
      border: 1px solid #ece6dc;
      border-radius: 24px;
      padding: 32px 28px;
      text-align: center;
      box-shadow: 0 16px 40px rgba(36, 34, 55, 0.08);
    }
    .note {
      font-size: 32px;
      color: #ef6a47;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      font-weight: 800;
    }
    p {
      margin: 0 0 22px;
      font-size: 15px;
      line-height: 1.5;
      color: #575366;
    }
    a {
      display: inline-block;
      background: #ef6a47;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      padding: 12px 24px;
      border-radius: 999px;
    }
  </style>
</head>
<body>
  <main role="alert">
    <div class="note" aria-hidden="true">♪</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://reading.oclef.com">Back to Oclef</a>
  </main>
</body>
</html>`;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!getStationKeyString()) {
    return res.status(503).send(
      renderRefusedHtml(
        'Station not ready',
        'KeyStance is not connected yet. Please return to your practice screen and try again shortly.',
      ),
    );
  }

  const rawToken =
    typeof req.query?.token === 'string'
      ? req.query.token
      : typeof req.body?.token === 'string'
        ? req.body.token
        : '';

  const wantsJson =
    req.method === 'POST' ||
    (String(req.headers?.accept ?? '').includes('application/json') &&
      !String(req.headers?.accept ?? '').includes('text/html'));

  if (!rawToken.trim()) {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: 'Missing token parameter' });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(
      renderRefusedHtml(
        'Practice link missing',
        'Please open KeyStance using the button on your Oclef practice screen.',
      ),
    );
  }

  try {
    const verified = await readLaunch(rawToken, {
      cookieHeader: req.headers?.cookie,
    });

    const secure = isHttpsRequest(req);
    const { token: sessionToken, visit } = await issueInternalVisitToken(verified);
    const sessionCookie = buildSessionCookie(sessionToken, secure);
    const seenJtiCookie = buildSeenJtisCookie(verified.jti, req.headers?.cookie, secure);

    res.setHeader('Set-Cookie', [sessionCookie, seenJtiCookie]);

    if (wantsJson) {
      return res.status(200).json({
        ok: true,
        visit: {
          sub: visit.sub,
          sessionId: visit.jti,
          stage: visit.stage,
          reason: visit.reason,
          returnUrl: visit.return_url,
          startedAt: visit.started_at,
          expiresAt: visit.expires_at,
        },
        syncToken: sessionToken,
      });
    }

    // Redirect to a clean address so the token never sits in the address bar or history.
    res.setHeader('Location', '/');
    return res.status(303).end();
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Invalid practice link';
    const isReplay = message.includes('already used');
    const statusCode = isReplay ? 403 : 401;

    if (wantsJson) {
      return res.status(statusCode).json({
        ok: false,
        error: isReplay ? 'This link was already used' : 'Practice link could not be verified or has expired',
      });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(statusCode).send(
      renderRefusedHtml(
        isReplay ? 'This link was already used' : 'Practice link expired',
        isReplay
          ? 'Each KeyStance practice link can only be opened once. Please go back to your Oclef practice screen and tap KeyStance again.'
          : 'This practice link has expired or could not be verified. Please go back to your Oclef practice screen and tap KeyStance again.',
      ),
    );
  }
}
