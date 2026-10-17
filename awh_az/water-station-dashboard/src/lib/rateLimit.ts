// Brute-force throttling for the login routes.
//
// Every attempt is counted BEFORE the credentials are checked (an atomic
// increment), so a burst of parallel guesses can't all slip past a "check then
// record" gap; a successful login clears the counter for that client.
//
// Storage: on Vercel's serverless platform an in-memory counter lives per
// instance and resets on cold start, so it only slows a single-instance
// attacker. Set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN to count in a
// shared Redis instead (plain HTTP, no extra dependency). If Redis is
// configured but unreachable, the limiter falls back to memory rather than
// failing open.

export interface CounterStore {
  /** Add one to the key's counter (starting a window if new); return the count and ms until the window ends. */
  incr(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  del(key: string): Promise<void>;
}

export function memoryStore(now: () => number = Date.now, maxEntries = 10_000): CounterStore {
  const map = new Map<string, { count: number; resetAt: number }>();
  return {
    async incr(key, windowMs) {
      const t = now();
      if (map.size >= maxEntries) {
        for (const [k, v] of map) if (v.resetAt <= t) map.delete(k);
        // still full of live entries: drop the oldest rather than grow without bound
        while (map.size >= maxEntries) map.delete(map.keys().next().value as string);
      }
      const cur = map.get(key);
      if (!cur || cur.resetAt <= t) {
        map.set(key, { count: 1, resetAt: t + windowMs });
        return { count: 1, ttlMs: windowMs };
      }
      cur.count += 1;
      return { count: cur.count, ttlMs: cur.resetAt - t };
    },
    async del(key) {
      map.delete(key);
    },
  };
}

export function upstashStore(
  url: string,
  token: string,
  fallback: CounterStore,
  fetchImpl: typeof fetch = fetch
): CounterStore {
  async function pipeline(commands: unknown[][]): Promise<{ result?: unknown }[]> {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    return res.json();
  }
  return {
    async incr(key, windowMs) {
      try {
        const [count, , ttl] = await pipeline([
          ['INCR', key],
          ['PEXPIRE', key, windowMs, 'NX'],
          ['PTTL', key],
        ]);
        const c = Number(count.result);
        const t = Number(ttl.result);
        if (!Number.isFinite(c)) throw new Error('bad reply');
        return { count: c, ttlMs: t > 0 ? t : windowMs };
      } catch {
        return fallback.incr(key, windowMs);
      }
    },
    async del(key) {
      try {
        await pipeline([['DEL', key]]);
      } catch {
        /* the memory fallback below still clears its own copy */
      }
      await fallback.del(key);
    },
  };
}

export interface Decision {
  allowed: boolean;
  retryAfterSec: number;
}

export interface Limiter {
  /** Count an attempt for `key`; `allowed` is false once the window's budget is spent. */
  attempt(key: string): Promise<Decision>;
  /** Forget `key` (after a successful login). */
  clear(key: string): Promise<void>;
}

export function createLimiter(store: CounterStore, max: number, windowMs: number): Limiter {
  return {
    async attempt(key) {
      const { count, ttlMs } = await store.incr(key, windowMs);
      return count > max
        ? { allowed: false, retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)) }
        : { allowed: true, retryAfterSec: 0 };
    },
    clear: key => store.del(key),
  };
}
