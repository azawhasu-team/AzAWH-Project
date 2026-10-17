import { createLimiter, memoryStore, upstashStore, type Limiter } from '@/lib/rateLimit';

// Per client: this many attempts per window, then locked out until it ends.
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
// Circuit breaker across all clients, for an attacker rotating IP addresses.
// Deliberately high so one person fumbling a password never trips it.
export const GLOBAL_MAX_ATTEMPTS = 200;
export const GLOBAL_WINDOW_MS = 60 * 60_000;

const memory = memoryStore();
const store =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? upstashStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN, memory)
    : memory;

const perClient: Limiter = createLimiter(store, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
const global: Limiter = createLimiter(store, GLOBAL_MAX_ATTEMPTS, GLOBAL_WINDOW_MS);

/** Vercel overwrites the forwarding headers, so these can't be spoofed by the caller there. */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export interface Guard {
  /** A ready 429 response when the caller must stop, else null. */
  blocked: Response | null;
  /** Call after the credentials were accepted. */
  succeeded(): Promise<void>;
}

/** `scope` keeps the site login and the admin passphrase on separate budgets. */
export async function guardLogin(request: Request, scope: 'login' | 'admin'): Promise<Guard> {
  const key = `rl:${scope}:${clientIp(request.headers)}`;
  const [mine, all] = await Promise.all([perClient.attempt(key), global.attempt(`rl:${scope}:*`)]);
  const worst = !mine.allowed ? mine : !all.allowed ? all : null;
  if (worst) {
    const mins = Math.ceil(worst.retryAfterSec / 60);
    return {
      blocked: new Response(
        JSON.stringify({ error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` }),
        {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': String(worst.retryAfterSec), 'cache-control': 'no-store' },
        }
      ),
      succeeded: async () => {},
    };
  }
  return { blocked: null, succeeded: () => perClient.clear(key) };
}
