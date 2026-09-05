export const AUTH_COOKIE = 'awh_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPass = process.env.DASHBOARD_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // fail closed if not configured

  const [userHash, passHash, expectedUserHash, expectedPassHash] = await Promise.all([
    sha256Hex(username),
    sha256Hex(password),
    sha256Hex(expectedUser),
    sha256Hex(expectedPass),
  ]);

  return timingSafeEqual(userHash, expectedUserHash) && timingSafeEqual(passHash, expectedPassHash);
}

// Session tokens are random + HMAC-signed with a secret separate from the
// login password, so a leaked cookie or compromised session can be
// invalidated by rotating SESSION_SECRET without changing DASHBOARD_PASSWORD.
export async function createSessionToken(): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null; // fail closed if not configured

  const nonce = crypto.randomUUID();
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${nonce}.${exp}`;
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return false;

  const [nonce, expStr, sig] = token.split('.');
  if (!nonce || !expStr || !sig) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expectedSig = await hmacHex(`${nonce}.${expStr}`, secret);
  return timingSafeEqual(sig, expectedSig);
}

// ---------------------------------------------------------------------------
// Admin gate — layered on TOP of the site session above, not a replacement
// for it. Knowing the site password alone isn't enough to reach /admin; this
// is one extra shared passphrase (not a second username), checked the same
// timing-safe way and signed into its own cookie with its own secret so it
// can be rotated (ADMIN_SESSION_SECRET) independently of the site session.
// ---------------------------------------------------------------------------
export const ADMIN_AUTH_COOKIE = 'awh_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours — shorter-lived than the site session

export async function verifyAdminPassphrase(passphrase: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected) return false; // fail closed if not configured

  const [inputHash, expectedHash] = await Promise.all([
    sha256Hex(passphrase),
    sha256Hex(expected),
  ]);
  return timingSafeEqual(inputHash, expectedHash);
}

export async function createAdminSessionToken(): Promise<string | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null; // fail closed if not configured

  const nonce = crypto.randomUUID();
  const exp = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;
  const payload = `${nonce}.${exp}`;
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyAdminSessionToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return false;

  const [nonce, expStr, sig] = token.split('.');
  if (!nonce || !expStr || !sig) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expectedSig = await hmacHex(`${nonce}.${expStr}`, secret);
  return timingSafeEqual(sig, expectedSig);
}
