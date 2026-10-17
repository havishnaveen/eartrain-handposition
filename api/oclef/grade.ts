import {
  getEarCooldownRemainingSeconds,
  getStationKeyString,
  recordEarRetryAfter,
  resolveOclefStationEndpoint,
  resolveVisitFromRequest,
  validateWavBuffer,
} from '../_lib/oclef.js';

export interface OclefNoteReferenceItem {
  pitch: string;
  onset_beats: number;
  duration_beats: number;
  hand?: 'right' | 'left';
}

export interface OclefExerciseReference {
  tempo_bpm?: number;
  beats_per_bar?: number;
  key_signature?: string;
  notes?: OclefNoteReferenceItem[];
  musicxml?: string;
}

export function normalizeAndValidateReference(input: unknown): string {
  const parsed: OclefExerciseReference =
    typeof input === 'string' ? JSON.parse(input) : (input as OclefExerciseReference);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Missing or invalid reference');
  }

  let serialized: string;
  if (typeof parsed.musicxml === 'string' && parsed.musicxml.trim().length > 0) {
    const out: Record<string, unknown> = {
      musicxml: parsed.musicxml,
    };
    if (typeof parsed.tempo_bpm === 'number' && Number.isFinite(parsed.tempo_bpm)) {
      out.tempo_bpm = Math.min(300, Math.max(20, Math.round(parsed.tempo_bpm)));
    }
    serialized = JSON.stringify(out);
  } else if (Array.isArray(parsed.notes) && parsed.notes.length > 0) {
    if (parsed.notes.length > 1000) {
      const err = new Error('Reference exceeds 1,000 notes limit');
      (err as any).statusCode = 413;
      throw err;
    }
    const tempo_bpm = Math.min(300, Math.max(20, Math.round(Number(parsed.tempo_bpm) || 80)));
    const beats_per_bar = Math.min(16, Math.max(1, Math.round(Number(parsed.beats_per_bar) || 4)));
    const allHaveHand = parsed.notes.every((n) => n && (n.hand === 'right' || n.hand === 'left'));
    const notes = parsed.notes.map((n) => ({
      pitch: String(n.pitch),
      onset_beats: Number(n.onset_beats) || 0,
      duration_beats: Math.max(0.05, Number(n.duration_beats) || 1),
      ...(allHaveHand ? { hand: n.hand } : {}),
    }));
    const out: Record<string, unknown> = {
      tempo_bpm,
      beats_per_bar,
      ...(typeof parsed.key_signature === 'string' && parsed.key_signature.trim()
        ? { key_signature: parsed.key_signature.trim() }
        : {}),
      notes,
    };
    serialized = JSON.stringify(out);
  } else {
    throw new Error('Reference must include musicxml or notes');
  }

  if (Buffer.byteLength(serialized, 'utf8') > 200 * 1024) {
    const err = new Error('Reference exceeds 200 KB limit');
    (err as any).statusCode = 413;
    throw err;
  }

  return serialized;
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

  const body = req.body ?? {};
  const audioBase64 = body.audioBase64 ?? body.wavBase64 ?? body.audio;
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    return res.status(400).json({ ok: false, error: 'Missing audio WAV payload' });
  }

  const wavBuffer = Buffer.from(audioBase64.replace(/^data:audio\/[\w+-]+;base64,/, ''), 'base64');

  let referenceJson: string;
  try {
    validateWavBuffer(wavBuffer);
    referenceJson = normalizeAndValidateReference(body.reference);
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return res.status(status).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid grade payload',
    });
  }

  const gradeUrl = resolveOclefStationEndpoint(visit.return_url, '/api/stations/keystance/grade');

  try {
    const form = new FormData();
    form.append('session_id', visit.jti);
    form.append('sub', visit.sub);
    form.append('audio', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'take.wav');
    form.append('reference', referenceJson);
    if (body.rhythm === true || body.rhythm === 'true') {
      form.append('rhythm', 'true');
    }

    const upstream = await fetch(gradeUrl, {
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
