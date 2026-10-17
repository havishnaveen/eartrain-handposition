import {
  getStationKeyString,
  resolveOclefStationEndpoint,
  resolveVisitFromRequest,
} from '../_lib/oclef.js';

export interface OclefLessonResultInput {
  id: string;
  title: string;
  completed: boolean;
  score?: number | null;
}

export interface OclefResultsBody {
  session_id: string;
  sub: string;
  minutes?: number;
  completed?: boolean;
  lessons?: Array<{
    id: string;
    title: string;
    completed: boolean;
    score?: number;
  }>;
  note?: string;
}

/**
 * Normalizes and validates a results report to strictly match KEYSTANCE.md Section 3:
 * - Only session_id, sub, minutes (0..600), completed (boolean), lessons (<=50), note (<=500)
 * - lessons[].id <= 64 chars, title <= 120 chars, completed boolean, optional score 0..100
 * - Whole body <= 32 KB, stored result <= 16 KB
 */
export function buildOclefResultsPayload(input: {
  session_id: string;
  sub: string;
  minutes?: unknown;
  completed?: unknown;
  lessons?: unknown;
  note?: unknown;
}): OclefResultsBody {
  const session_id = String(input.session_id || '').trim();
  const sub = String(input.sub || '').trim();
  if (!session_id || !sub) {
    throw new Error('session_id and sub are required');
  }

  const out: OclefResultsBody = {
    session_id,
    sub,
  };

  if (input.minutes !== undefined && input.minutes !== null) {
    const m = Number(input.minutes);
    if (Number.isFinite(m)) {
      out.minutes = Math.min(600, Math.max(0, Math.round(m)));
    }
  }

  if (typeof input.completed === 'boolean') {
    out.completed = input.completed;
  }

  if (Array.isArray(input.lessons)) {
    const cleanLessons: NonNullable<OclefResultsBody['lessons']> = [];
    for (const raw of input.lessons.slice(0, 50)) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String((raw as any).id ?? '').trim().slice(0, 64);
      const title = String((raw as any).title ?? '').trim().slice(0, 120);
      if (!id || !title) continue;
      const completed = Boolean((raw as any).completed);
      const rawScore = (raw as any).score;
      const hasScore = typeof rawScore === 'number' && Number.isFinite(rawScore);
      cleanLessons.push({
        id,
        title,
        completed,
        ...(hasScore ? { score: Math.min(100, Math.max(0, Math.round(rawScore))) } : {}),
      });
    }
    out.lessons = cleanLessons;
  }

  if (typeof input.note === 'string' && input.note.trim().length > 0) {
    out.note = input.note.trim().slice(0, 500);
  }

  // Enforce < 16 KB serialized size
  while (out.lessons && out.lessons.length > 1 && Buffer.byteLength(JSON.stringify(out), 'utf8') > 15_000) {
    out.lessons.pop();
  }

  return out;
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
  const body = req.body ?? {};
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - visit.started_at) / 60000));

  let payload: OclefResultsBody;
  try {
    payload = buildOclefResultsPayload({
      session_id: visit.jti,
      sub: visit.sub,
      minutes: body.minutes ?? elapsedMinutes,
      completed: body.completed ?? true,
      lessons: body.lessons,
      note: body.note,
    });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid results payload' });
  }

  const resultsUrl = resolveOclefStationEndpoint(visit.return_url, '/api/stations/keystance/results');

  try {
    const upstream = await fetch(resultsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stationKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch {
    return res.status(503).json({
      ok: false,
      error: 'Oclef results service is temporarily unavailable; please retry shortly.',
    });
  }
}
