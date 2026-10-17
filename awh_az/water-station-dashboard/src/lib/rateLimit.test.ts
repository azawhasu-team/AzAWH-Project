import { describe, it, expect, vi } from 'vitest';
import { memoryStore, upstashStore, createLimiter } from './rateLimit';

describe('createLimiter (memory store)', () => {
  const setup = (max = 3, windowMs = 60_000) => {
    let t = 1_000_000;
    const store = memoryStore(() => t);
    return { limiter: createLimiter(store, max, windowMs), advance: (ms: number) => (t += ms) };
  };

  it('allows up to the budget, then blocks with a retry time', async () => {
    const { limiter } = setup(3);
    for (let i = 0; i < 3; i++) expect((await limiter.attempt('ip')).allowed).toBe(true);
    const blocked = await limiter.attempt('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('keeps clients independent', async () => {
    const { limiter } = setup(1);
    await limiter.attempt('a');
    expect((await limiter.attempt('a')).allowed).toBe(false);
    expect((await limiter.attempt('b')).allowed).toBe(true);
  });

  it('opens a fresh window after it elapses', async () => {
    const { limiter, advance } = setup(1, 60_000);
    await limiter.attempt('ip');
    expect((await limiter.attempt('ip')).allowed).toBe(false);
    advance(60_001);
    expect((await limiter.attempt('ip')).allowed).toBe(true);
  });

  it('clear() restores the budget (successful login)', async () => {
    const { limiter } = setup(1);
    await limiter.attempt('ip');
    await limiter.clear('ip');
    expect((await limiter.attempt('ip')).allowed).toBe(true);
  });

  it('counts a parallel burst atomically: exactly `max` get through', async () => {
    const { limiter } = setup(5);
    const results = await Promise.all(Array.from({ length: 40 }, () => limiter.attempt('ip')));
    expect(results.filter(r => r.allowed)).toHaveLength(5);
  });

  it('stays bounded under many distinct keys', async () => {
    const store = memoryStore(() => 1, 50);
    for (let i = 0; i < 500; i++) await store.incr(`k${i}`, 60_000);
    // no assertion on internals: it must simply not blow up or leak without bound
    expect((await store.incr('last', 60_000)).count).toBe(1);
  });
});

describe('upstashStore', () => {
  const reply = (count: number, ttl: number) =>
    new Response(JSON.stringify([{ result: count }, { result: 1 }, { result: ttl }]), { status: 200 });

  it('increments through the pipeline endpoint with the bearer token', async () => {
    const f = vi.fn(async () => reply(3, 42_000));
    const store = upstashStore('https://r.example/', 'tok', memoryStore(), f as unknown as typeof fetch);
    expect(await store.incr('k', 900_000)).toEqual({ count: 3, ttlMs: 42_000 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://r.example/pipeline');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)[0]).toEqual(['INCR', 'k']);
  });

  it('falls back to memory (not open) when Redis errors', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 500 }));
    const limiter = createLimiter(upstashStore('https://r.example', 't', memoryStore(), f as unknown as typeof fetch), 2, 60_000);
    expect((await limiter.attempt('k')).allowed).toBe(true);
    expect((await limiter.attempt('k')).allowed).toBe(true);
    expect((await limiter.attempt('k')).allowed).toBe(false);
  });

  it('falls back when the network call throws', async () => {
    const f = vi.fn(async () => { throw new Error('down'); });
    const store = upstashStore('https://r.example', 't', memoryStore(), f as unknown as typeof fetch);
    expect((await store.incr('k', 1000)).count).toBe(1);
  });
});
