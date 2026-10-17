import {
  getEarCooldownRemainingSeconds,
  getStationKeyString,
  recordEarRetryAfter,
  resolveOclefStationEndpoint,
  resolveVisitFromRequest,
  validateWavBuffer,
} from '../_lib/oclef.js';

function extractWavBuffer(req: any): Buffer | null {
  if (Buffer.isBuffer(req.body)) return req.body;
  const audioBase64 = req.body?.audioBase64 ?? req.body?.wavBase64 ?? req.body?.audio;
  if (typeof audioBase64 === 'string' && audioBase64.length > 0) {
    const cleaned = audioBase64.replace(/^data:audio\/[\w+-]+;base64,/, '');
    return Buffer.from(cleaned, 'base64');
  }
  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stationKey = getStationKeyString();
  if (!stationKey) {
    return res.status(503).json({ ok: false, error: 'OCLEF_STATION_KEY is not configured' });
  }

  const resolved = await resolveVisitFromRequest(req);
  if (!resolved) {
    return res.status(401).json({ ok: false, error: 'No active Oclef visit session' });
  }

  const { visit } = resolved;
  if (Date.now() - visit.started_at > 2 * 60 * 60 * 1000) {
    return res.status(410).json({ ok: false, error: 'The visit is more than 2 hours old and closed' });
  }

  const cooldown = getEarCooldownRemainingSeconds();
  if (cooldown > 0) {
    res.setHeader('Retry-After', String(cooldown));
    return res.status(503).json({
      ok: false,
      retryAfterSeconds: cooldown,
      error: `Oclef ear is busy with children's sight reading. Retry after ${cooldown} seconds.`,
    });
  }

  const wavBuffer = extractWavBuffer(req);
  if (!wavBuffer) {
    return res.status(400).json({ ok: false, error: 'Missing audio WAV payload' });
  }

  try {
    validateWavBuffer(wavBuffer);
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return res.status(status).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid WAV audio',
    });
  }

  const hearUrl = resolveOclefStationEndpoint(visit.return_url, '/api/stations/keystance/hear');

  try {
    const form = new FormData();
    form.append('session_id', visit.jti);
    form.append('sub', visit.sub);
    form.append('audio', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'take.wav');

    const upstream = await fetch(hearUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stationKey}`,
      },
      body: form,
    });

    if (upstream.status === 503 || upstream.status === 429) {
      const waitSec = recordEarRetryAfter(upstream.headers.get('retry-after'));
      res.setHeader('Retry-After', String(waitSec));
      const errBody = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({
        ok: false,
        retryAfterSeconds: waitSec,
        ...errBody,
      });
    }

    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch {
    return res.status(502).json({
      ok: false,
      error: 'Could not reach the Oclef ear service; please try later.',
    });
  }
}
