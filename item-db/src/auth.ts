import type { Env } from './types';

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlJson(obj: unknown): string {
  return b64url(enc.encode(JSON.stringify(obj)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export function getAdminPassword(env: Env): string | null {
  const pw = env.ADMIN_PASSWORD?.trim();
  return pw || null;
}

export async function createAdminToken(env: Env, ttlSeconds = 60 * 60 * 12): Promise<string | null> {
  const secret = getAdminPassword(env);
  if (!secret) return null;
  const payload = {
    sub: 'admin',
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64urlJson(payload);
  const key = await hmacKey(secret);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${sig}`;
}

export async function verifyAdminToken(env: Env, token: string | null | undefined): Promise<boolean> {
  const secret = getAdminPassword(env);
  if (!secret || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  const key = await hmacKey(secret);
  const expected = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  if (expected !== sig) return false;
  try {
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (json.sub !== 'admin') return false;
    if (typeof json.exp !== 'number' || json.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Accept Bearer token or raw admin password (for seed scripts). */
export async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  const password = getAdminPassword(env);
  if (!password) {
    return new Response(JSON.stringify({ success: false, error: '管理パスワード未設定' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const headerPw = request.headers.get('X-Admin-Password') || '';

  if (headerPw && headerPw === password) return null;
  if (bearer && (bearer === password || (await verifyAdminToken(env, bearer)))) return null;

  return new Response(JSON.stringify({ success: false, error: '認証が必要です' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
