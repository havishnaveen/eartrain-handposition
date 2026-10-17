import crypto from 'node:crypto';
import fs from 'node:fs';
import { SignJWT, jwtVerify } from 'jose';

export const OCLEF_REASONS = [
  'demo',
  'clef-confusion',
  'wrong-register',
  'accidental-persistence',
  'starting-position',
  'key-signature',
] as const;

export type OclefReason = (typeof OCLEF_REASONS)[number];

const OCLEF_REASON_SET = new Set<string>(OCLEF_REASONS);

/** Keep accepted jtis for 48 hours (spec requires at least 24 hours). */
export const JTI_TTL_MS = 48 * 60 * 60 * 1000;
export const SEEN_JTI_RETENTION_MS = JTI_TTL_MS;
/** A visit stays open for 2 hours from her tap (spec Section 9). */
export const VISIT_TTL_SECONDS = 2 * 60 * 60;
export const VISIT_TTL_MS = VISIT_TTL_SECONDS * 1000;

export const SESSION_COOKIE_NAME = 'ks_oclef_session';
export const SEEN_JTI_COOKIE_NAME = 'ks_oclef_seen_jtis';
const JTI_STORE_PATH = '/tmp/keystance-oclef-seen-jtis.json';

export interface VerifiedOclefLaunch {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  stage: string | number | null;
  reason: OclefReason;
  return_url: string;
  returnUrl: string;
}

export interface ActiveOclefVisit {
  sub: string;
  jti: string;
  stage: string | number | null;
  reason: OclefReason;
  return_url: string;
  started_at: number;
  expires_at: number;
}

const memorySeenJtis = new Map<string, number>();
let earCooldownUntilMs = 0;

export function resetOclefServerStateForTests(): void {
  memorySeenJtis.clear();
  earCooldownUntilMs = 0;
  try {
    if (fs.existsSync(JTI_STORE_PATH)) {
      fs.unlinkSync(JTI_STORE_PATH);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function getStationKeyString(): string {
  return (process.env.OCLEF_STATION_KEY || '').trim();
}

/**
 * Per KEYSTANCE.md Section 2:
 * "the key is used as the text of the string we send you, not decoded from hex"
 */
export function getStationKeyBytes(overrideKey?: string): Uint8Array {
  const raw = (overrideKey ?? getStationKeyString()).trim();
  if (!raw) {
    throw new Error('OCLEF_STATION_KEY is not configured');
  }
  return new TextEncoder().encode(raw);
}

/** Separate derived key for signing KeyStance's own HttpOnly session cookie. */
function getInternalSessionKeyBytes(overrideKey?: string): Uint8Array {
  const raw = (overrideKey ?? getStationKeyString()).trim();
  if (!raw) {
    throw new Error('OCLEF_STATION_KEY is not configured');
  }
  return crypto.createHmac('sha256', raw).update('keystance-internal-session-v1').digest();
}

export function normalizeOclefReason(value: unknown): OclefReason {
  if (typeof value === 'string' && OCLEF_REASON_SET.has(value)) {
    return value as OclefReason;
  }
  return 'demo';
}

function isApprovedOclefPartnerUrl(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  const isLocal =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (host === 'localhost' || host === '127.0.0.1');
  const isOclef =
    parsed.protocol === 'https:' &&
    (host === 'reading.oclef.com' ||
      host.endsWith('.oclef.com') ||
      host.endsWith('.up.railway.app'));
  const isKeyStance =
    parsed.protocol === 'https:' &&
    (host === 'keystance.vercel.app' || host.endsWith('.vercel.app'));
  return isOclef || isLocal || isKeyStance;
}

/**
 * Validates that return_url is a legitimate Oclef return URL (including staging & localhost)
 * and returns the exact string untouched (per Section 4: "send her browser to
 * return_url exactly as given... Never build this address yourself and never add anything to it").
 */
export function validateExactReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Error('Invalid return_url');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid return_url');
  }

  if (!isApprovedOclefPartnerUrl(parsed)) {
    throw new Error('Unapproved return_url host');
  }
  return value;
}

/**
 * Resolves an Oclef station API endpoint using the host from the token's return_url
 * (per Section 3: "Use the host in the token's return_url (it is the Oclef site she came from)").
 */
export function resolveOclefStationEndpoint(
  returnUrl: string | undefined,
  pathOrAction:
    | 'results'
    | 'hear'
    | 'grade'
    | '/api/stations/keystance/results'
    | '/api/stations/keystance/hear'
    | '/api/stations/keystance/grade',
): string {
  const endpointPath = pathOrAction.startsWith('/api/')
    ? pathOrAction
    : `/api/stations/keystance/${pathOrAction}`;
  if (returnUrl) {
    try {
      const parsed = new URL(returnUrl);
      if (isApprovedOclefPartnerUrl(parsed)) {
        return new URL(endpointPath, `${parsed.protocol}//${parsed.host}`).toString();
      }
    } catch {
      // Fall back to default Oclef host
    }
  }
  return `https://reading.oclef.com${endpointPath}`;
}

function loadDiskJtis(now = Date.now()): void {
  try {
    if (!fs.existsSync(JTI_STORE_PATH)) return;
    const raw = fs.readFileSync(JTI_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== 'object') return;
    for (const [jti, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && now - ts < JTI_TTL_MS) {
        const existing = memorySeenJtis.get(jti) ?? 0;
        if (ts > existing) memorySeenJtis.set(jti, ts);
      }
    }
  } catch {
    // Ephemeral disk cache is best-effort alongside memory + signed cookie.
  }
}

function saveDiskJtis(now = Date.now()): void {
  for (const [jti, ts] of memorySeenJtis.entries()) {
    if (now - ts >= JTI_TTL_MS) {
      memorySeenJtis.delete(jti);
    }
  }
  try {
    const serialized: Record<string, number> = {};
    for (const [jti, ts] of memorySeenJtis.entries()) {
      serialized[jti] = ts;
    }
    fs.writeFileSync(JTI_STORE_PATH, JSON.stringify(serialized), { mode: 0o600 });
  } catch {
    // Ignore read-only filesystem errors
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(val);
    } catch {
      out[name] = val;
    }
  }
  return out;
}

function signCookieValue(payload: string, overrideKey?: string): string {
  const mac = crypto
    .createHmac('sha256', getInternalSessionKeyBytes(overrideKey))
    .update(payload)
    .digest('base64url');
  return `${payload}.${mac}`;
}

function verifyCookieValue(signed: string | undefined, overrideKey?: string): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = crypto
    .createHmac('sha256', getInternalSessionKeyBytes(overrideKey))
    .update(payload)
    .digest('base64url');
  const bufA = Buffer.from(sig, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }
  return payload;
}

export function readCookieSeenJtis(cookieHeader: string | undefined, overrideKey?: string, now = Date.now()): Map<string, number> {
  const result = new Map<string, number>();
  const cookies = parseCookies(cookieHeader);
  const verified = verifyCookieValue(cookies[SEEN_JTI_COOKIE_NAME], overrideKey);
  if (!verified) return result;
  try {
    const parsed = JSON.parse(Buffer.from(verified, 'base64url').toString('utf8')) as Record<string, number>;
    if (parsed && typeof parsed === 'object') {
      for (const [jti, ts] of Object.entries(parsed)) {
        if (typeof ts === 'number' && now - ts < JTI_TTL_MS) {
          result.set(jti, ts);
        }
      }
    }
  } catch {
    // Ignore malformed cookie
  }
  return result;
}

export function buildSeenJtisCookie(
  jti: string,
  cookieHeader: string | undefined,
  secure: boolean,
  overrideKey?: string,
  now = Date.now(),
): string {
  const map = readCookieSeenJtis(cookieHeader, overrideKey, now);
  map.set(jti, now);
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  const obj: Record<string, number> = {};
  for (const [k, v] of entries) obj[k] = v;
  const encoded = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const signed = signCookieValue(encoded, overrideKey);
  const maxAge = Math.floor(JTI_TTL_MS / 1000);
  return `${SEEN_JTI_COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export async function alreadySeen(
  jti: string,
  cookieHeader?: string,
  overrideKey?: string,
  now = Date.now(),
): Promise<boolean> {
  loadDiskJtis(now);
  const memTs = memorySeenJtis.get(jti);
  if (typeof memTs === 'number' && now - memTs < JTI_TTL_MS) {
    return true;
  }
  const cookieMap = readCookieSeenJtis(cookieHeader, overrideKey, now);
  const cookieTs = cookieMap.get(jti);
  if (typeof cookieTs === 'number' && now - cookieTs < JTI_TTL_MS) {
    memorySeenJtis.set(jti, cookieTs);
    return true;
  }
  return false;
}

export async function remember(jti: string, now = Date.now()): Promise<void> {
  loadDiskJtis(now);
  memorySeenJtis.set(jti, now);
  saveDiskJtis(now);
}

/**
 * Verifies an Oclef launch JWT per KEYSTANCE.md Section 2:
 * - HS256 signed with OCLEF_STATION_KEY (UTF-8 text bytes)
 * - iss === 'oclef', aud === 'keystance'
 * - Required claims: sub, jti, iat, exp, return_url
 * - Single-use jti (kept for >= 24 hours)
 */
export async function readLaunch(
  token: string,
  options?: {
    cookieHeader?: string;
    overrideKey?: string;
  },
): Promise<VerifiedOclefLaunch> {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Missing launch token');
  }
  const key = getStationKeyBytes(options?.overrideKey);
  const { payload } = await jwtVerify(token.trim(), key, {
    algorithms: ['HS256'],
    issuer: 'oclef',
    audience: 'keystance',
  });

  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0 || payload.sub.length > 64) {
    throw new Error('Invalid sub claim');
  }
  if (typeof payload.jti !== 'string' || payload.jti.trim().length === 0 || payload.jti.length > 128) {
    throw new Error('Invalid jti claim');
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    throw new Error('Missing iat or exp claim');
  }

  const return_url = validateExactReturnUrl(payload.return_url);
  const stage =
    typeof payload.stage === 'string' && payload.stage.trim().length > 0
      ? payload.stage.trim().slice(0, 32)
      : typeof payload.stage === 'number' && Number.isFinite(payload.stage)
        ? payload.stage
        : null;
  const reason = normalizeOclefReason(payload.reason);

  if (await alreadySeen(payload.jti, options?.cookieHeader, options?.overrideKey)) {
    throw new Error('This link was already used');
  }
  await remember(payload.jti);

  return {
    sub: payload.sub,
    jti: payload.jti,
    iat: payload.iat,
    exp: payload.exp,
    stage,
    reason,
    return_url,
    returnUrl: return_url,
  };
}

export async function issueInternalVisitToken(
  launch: VerifiedOclefLaunch,
  overrideKey?: string,
  nowMs = Date.now(),
): Promise<{ token: string; visit: ActiveOclefVisit }> {
  const started_at = nowMs;
  const expires_at = nowMs + VISIT_TTL_MS;
  const visit: ActiveOclefVisit = {
    sub: launch.sub,
    jti: launch.jti,
    stage: launch.stage,
    reason: launch.reason,
    return_url: launch.return_url,
    started_at,
    expires_at,
  };
  const token = await new SignJWT({
    jti: visit.jti,
    stage: visit.stage,
    reason: visit.reason,
    return_url: visit.return_url,
    started_at: visit.started_at,
    expires_at: visit.expires_at,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(visit.sub)
    .setIssuer('keystance-session')
    .setAudience('keystance-web')
    .setIssuedAt(Math.floor(started_at / 1000))
    .setExpirationTime(Math.floor(expires_at / 1000))
    .sign(getInternalSessionKeyBytes(overrideKey));

  return { token, visit };
}

export async function verifyInternalVisitToken(
  token: string,
  overrideKey?: string,
): Promise<ActiveOclefVisit | null> {
  if (!token || typeof token !== 'string') return null;
  try {
    const { payload } = await jwtVerify(token, getInternalSessionKeyBytes(overrideKey), {
      algorithms: ['HS256'],
      issuer: 'keystance-session',
      audience: 'keystance-web',
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.return_url !== 'string'
    ) {
      return null;
    }
    const expires_at = Number(payload.expires_at) || (payload.exp ? payload.exp * 1000 : 0);
    if (expires_at <= Date.now()) return null;
    return {
      sub: payload.sub,
      jti: payload.jti,
      stage:
        typeof payload.stage === 'string'
          ? payload.stage
          : typeof payload.stage === 'number'
            ? payload.stage
            : null,
      reason: normalizeOclefReason(payload.reason),
      return_url: validateExactReturnUrl(payload.return_url),
      started_at: Number(payload.started_at) || Date.now(),
      expires_at,
    };
  } catch {
    return null;
  }
}

export async function resolveVisitFromRequest(
  req: any,
  overrideKey?: string,
): Promise<{ visit: ActiveOclefVisit; rawToken: string } | null> {
  const cookies = parseCookies(req.headers?.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    const visit = await verifyInternalVisitToken(cookieToken, overrideKey);
    if (visit) return { visit, rawToken: cookieToken };
  }
  const authHeader = String(req.headers?.authorization ?? '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) {
    const visit = await verifyInternalVisitToken(bearer, overrideKey);
    if (visit) return { visit, rawToken: bearer };
  }
  return null;
}

export function buildSessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${VISIT_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function isHttpsRequest(req: any): boolean {
  const proto = String(req.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim();
  if (proto === 'https') return true;
  const host = String(req.headers?.host ?? '');
  return !host.startsWith('localhost') && !host.startsWith('127.0.0.1');
}

export function getEarCooldownRemainingSeconds(now = Date.now()): number {
  if (earCooldownUntilMs <= now) return 0;
  return Math.ceil((earCooldownUntilMs - now) / 1000);
}

export function recordEarRetryAfter(retryAfterHeader: string | null | undefined, now = Date.now()): number {
  const parsed = Number(retryAfterHeader);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? Math.min(3600, Math.ceil(parsed)) : 30;
  earCooldownUntilMs = Math.max(earCooldownUntilMs, now + seconds * 1000);
  return seconds;
}

export interface ValidatedWavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  audioFormat: number;
  dataBytes: number;
  durationSeconds: number;
}

/**
 * Validates WAV header & limits per KEYSTANCE.md Sections 9 & 10:
 * - Uncompressed PCM (1) or IEEE float (3)
 * - At most 4 MB (4 * 1024 * 1024 bytes)
 * - At most 60 seconds
 */
export function validateWavBuffer(buffer: Buffer): ValidatedWavInfo {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 44) {
    throw new Error('Audio is not a valid WAV file');
  }
  if (buffer.byteLength > 4 * 1024 * 1024) {
    const err = new Error('Audio exceeds 4 MB limit');
    (err as any).statusCode = 413;
    throw err;
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    const err = new Error('Audio is not a WAV file');
    (err as any).statusCode = 415;
    throw err;
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    if (chunkId === 'fmt ' && chunkSize >= 16 && chunkDataOffset + 16 <= buffer.byteLength) {
      audioFormat = buffer.readUInt16LE(chunkDataOffset);
      channels = buffer.readUInt16LE(chunkDataOffset + 2);
      sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      byteRate = buffer.readUInt32LE(chunkDataOffset + 8);
      bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
    } else if (chunkId === 'data') {
      dataBytes = Math.min(chunkSize, buffer.byteLength - chunkDataOffset);
      break;
    }
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1 && audioFormat !== 3) {
    const err = new Error('WAV must be uncompressed PCM or float');
    (err as any).statusCode = 415;
    throw err;
  }
  if (channels < 1 || sampleRate < 8000 || byteRate <= 0) {
    const err = new Error('Invalid WAV format parameters');
    (err as any).statusCode = 415;
    throw err;
  }
  const durationSeconds = dataBytes / byteRate;
  if (durationSeconds > 60.5) {
    const err = new Error('Audio exceeds 60 second limit');
    (err as any).statusCode = 413;
    throw err;
  }

  return {
    channels,
    sampleRate,
    bitsPerSample,
    audioFormat,
    dataBytes,
    durationSeconds,
  };
}

export function validateMonoWavBuffer(buffer: Buffer): {
  ok: boolean;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  durationSec: number;
  byteLength: number;
  error?: string;
} {
  try {
    const info = validateWavBuffer(buffer);
    if (info.channels !== 1) {
      return {
        ok: false,
        channels: info.channels,
        sampleRate: info.sampleRate,
        bitsPerSample: info.bitsPerSample,
        durationSec: info.durationSeconds,
        byteLength: buffer.byteLength,
        error: 'WAV must be mono (1 channel)',
      };
    }
    return {
      ok: true,
      channels: info.channels,
      sampleRate: info.sampleRate,
      bitsPerSample: info.bitsPerSample,
      durationSec: info.durationSeconds,
      byteLength: buffer.byteLength,
    };
  } catch (err: any) {
    return {
      ok: false,
      channels: 0,
      sampleRate: 0,
      bitsPerSample: 0,
      durationSec: 0,
      byteLength: buffer?.byteLength ?? 0,
      error: err?.message ?? 'Invalid WAV',
    };
  }
}
