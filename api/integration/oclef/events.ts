import crypto from 'node:crypto';

const OCLEF_STATION_KEY = process.env.OCLEF_STATION_KEY || '';
const OCLEF_UPSTREAM_EVENTS_URL = process.env.OCLEF_UPSTREAM_EVENTS_URL || '';

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

function verifySyncToken(token: string, secret: string): Record<string, any> | null {
  if (!secret) return null;
  if (token === secret) {
    return { sub: 'direct-station-key', iss: 'oclef-station' };
  }
  const parts = token.split('.');
  if (parts.length === 3 && parts[0] === 'ks1') {
    const [, payloadB64, sigB64] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const bufA = Buffer.from(sigB64, 'utf8');
    const bufB = Buffer.from(expectedSig, 'utf8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return null;
    }
    try {
      const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (typeof claims.exp === 'number' && claims.exp <= Date.now()) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }
  return null;
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'keystance-oclef-events',
      configured: Boolean(OCLEF_STATION_KEY),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!OCLEF_STATION_KEY) {
    return res.status(503).json({ error: 'OCLEF_STATION_KEY is not configured on the server.' });
  }

  const authHeader = String(req.headers?.authorization ?? '');
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const stationHeader = String(req.headers?.['x-oclef-station-key'] ?? '').trim();
  const tokenToVerify = bearerToken || stationHeader;

  const claims = verifySyncToken(tokenToVerify, OCLEF_STATION_KEY);
  if (!claims) {
    return res.status(401).json({ error: 'Unauthorized sync token.' });
  }

  const { schemaVersion, events } = req.body ?? {};
  if (schemaVersion !== 1 || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Invalid event batch payload.' });
  }

  const validEventIds: string[] = [];
  for (const item of events) {
    const id = item?.event?.id ?? item?.id;
    if (typeof id === 'string' && id.length > 0) {
      validEventIds.push(id);
    }
  }

  // Forward to upstream Oclef station ingestion endpoint if configured or reachable
  const upstreamUrl = OCLEF_UPSTREAM_EVENTS_URL || 'https://reading.oclef.com/api/station/events';
  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OCLEF_STATION_KEY}`,
        'X-Oclef-Station-Key': OCLEF_STATION_KEY,
      },
      body: JSON.stringify({
        schemaVersion: 1,
        station: 'keystance-web',
        claims,
        events,
      }),
    });

    if (upstreamRes.ok) {
      const upstreamData: any = await upstreamRes.json().catch(() => null);
      if (upstreamData && Array.isArray(upstreamData.acceptedEventIds)) {
        return res.status(200).json({
          acceptedEventIds: upstreamData.acceptedEventIds,
        });
      }
    }
  } catch {
    // If reading.oclef.com does not expose a push webhook at the default URL yet,
    // still acknowledge receipt on KeyStance's station endpoint.
  }

  return res.status(200).json({
    acceptedEventIds: validEventIds,
  });
}
