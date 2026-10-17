import { describe, it, expect, vi } from 'vitest';
import { forwardToBackend } from './backendProxy';

const req = (path: string, init: RequestInit = {}) => new Request(`https://dash.test/api/backend/${path}`, init);
const upstreamOk = () => vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'leak=1' } }));

describe('forwardToBackend', () => {
  const base = { backendUrl: 'https://api.test/', apiKey: 'secret', sessionOk: true };

  it('refuses without a session and never calls the backend', async () => {
    const f = upstreamOk();
    const r = await forwardToBackend(req('stations'), ['stations'], { ...base, sessionOk: false, fetchImpl: f });
    expect(r.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('forwards GET with the API key, path and query, and drops upstream cookies', async () => {
    const f = upstreamOk();
    const r = await forwardToBackend(req('stations/a%20b/readings?limit=5'), ['stations', 'a%20b', 'readings'], { ...base, fetchImpl: f });
    expect(r.status).toBe(200);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/stations/a%20b/readings?limit=5');
    expect((init.headers as Headers).get('x-api-key')).toBe('secret');
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('never forwards the browser cookie or authorization headers', async () => {
    const f = upstreamOk();
    await forwardToBackend(req('impact', { headers: { cookie: 'awh_session=x', authorization: 'Bearer y', 'x-api-key': 'attacker', 'x-admin-key': 'z' } }), ['impact'], { ...base, fetchImpl: f });
    const h = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers;
    expect(h.get('cookie')).toBeNull();
    expect(h.get('authorization')).toBeNull();
    expect(h.get('x-admin-key')).toBeNull();
    expect(h.get('x-api-key')).toBe('secret'); // the server's key, not the browser's
  });

  it.each([['admin', 'stations'], ['cache', 'flush'], ['docs'], ['openapi.json'], ['health']])('refuses %j', async (...segs) => {
    const f = upstreamOk();
    const r = await forwardToBackend(req(segs.join('/')), segs, { ...base, fetchImpl: f });
    expect(r.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects traversal and malformed segments', async () => {
    const f = upstreamOk();
    for (const segs of [['stations', '..', 'admin'], ['stations', '%2e%2e', 'admin'], ['stations', '%5C'], ['stations', '%E0%A4%A']]) {
      const r = await forwardToBackend(req('x'), segs, { ...base, fetchImpl: f });
      expect(r.status, segs.join('/')).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('only allows POST on export, and blocks other methods', async () => {
    const f = upstreamOk();
    const post = (p: string, segs: string[]) => forwardToBackend(req(p, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), segs, { ...base, fetchImpl: f });
    expect((await post('export', ['export'])).status).toBe(200);
    expect((await post('stations-registry', ['stations-registry'])).status).toBe(405);
    expect((await forwardToBackend(req('stations', { method: 'DELETE' }), ['stations'], { ...base, fetchImpl: f })).status).toBe(405);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('streams the body of an export through with its download headers', async () => {
    const f = vi.fn(async () => new Response('a,b\n1,2\n', { status: 200, headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="x.csv"' } }));
    const r = await forwardToBackend(req('export', { method: 'POST', body: '{}' }), ['export'], { ...base, fetchImpl: f });
    expect(r.headers.get('content-disposition')).toContain('x.csv');
    expect(await r.text()).toBe('a,b\n1,2\n');
  });

  it('passes upstream errors through and reports an unreachable backend as 502', async () => {
    const r1 = await forwardToBackend(req('stations'), ['stations'], { ...base, fetchImpl: vi.fn(async () => new Response('{"detail":"x"}', { status: 503 })) });
    expect(r1.status).toBe(503);
    const r2 = await forwardToBackend(req('stations'), ['stations'], { ...base, fetchImpl: vi.fn(async () => { throw new Error('down'); }) });
    expect(r2.status).toBe(502);
  });

  it('omits the key header when none is configured (transitional)', async () => {
    const f = upstreamOk();
    await forwardToBackend(req('stations'), ['stations'], { ...base, apiKey: undefined, fetchImpl: f });
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers).get('x-api-key')).toBeNull();
  });
});
