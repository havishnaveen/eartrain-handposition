import {
  getStationKeyString,
  resolveVisitFromRequest,
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
      service: 'keystance-oclef-events',
      configured: Boolean(getStationKeyString()),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resolved = await resolveVisitFromRequest(req);
  if (!resolved) {
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

  return res.status(200).json({
    acceptedEventIds: validEventIds,
  });
}
