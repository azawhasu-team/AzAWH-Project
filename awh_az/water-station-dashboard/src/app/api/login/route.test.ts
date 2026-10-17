import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

beforeAll(() => {
  vi.stubEnv('DASHBOARD_USER', 'lab');
  vi.stubEnv('DASHBOARD_PASSWORD', 'correct horse');
  vi.stubEnv('SESSION_SECRET', 'test-session-secret');
  vi.stubEnv('ADMIN_PASSPHRASE', 'open sesame');
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret');
});
afterAll(() => vi.unstubAllEnvs());

import { POST as siteLogin } from './route';
import { POST as adminLogin } from '../admin/login/route';
import { NextRequest } from 'next/server';
import { LOGIN_MAX_ATTEMPTS } from '@/lib/loginGuard';

let n = 0;
const ip = () => `203.0.113.${++n}`; // each test gets its own client
const post = (url: string, body: unknown, clientIp: string, raw = false) =>
  new NextRequest(`https://dash.test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': clientIp },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const wrong = { username: 'lab', password: 'nope' };
const right = { username: 'lab', password: 'correct horse' };

describe('POST /api/login throttling', () => {
  it('rejects a wrong password with 401 for the first attempts, then locks the client with 429', async () => {
    const c = ip();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect((await siteLogin(post('/api/login', wrong, c))).status).toBe(401);
    }
    const locked = await siteLogin(post('/api/login', wrong, c));
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await locked.json()).error).toMatch(/Too many attempts/);
  });

  it('does not even check the right password once locked out', async () => {
    const c = ip();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) await siteLogin(post('/api/login', wrong, c));
    expect((await siteLogin(post('/api/login', right, c))).status).toBe(429);
  });

  it('lets the right password in, sets the session cookie, and resets the budget', async () => {
    const c = ip();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) await siteLogin(post('/api/login', wrong, c));
    const ok = await siteLogin(post('/api/login', right, c));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toContain('awh_session=');
    // budget restored: a full set of failures is allowed again before the next lockout
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect((await siteLogin(post('/api/login', wrong, c))).status).toBe(401);
    }
  });

  it("one client's lockout does not affect another", async () => {
    const a = ip();
    const b = ip();
    for (let i = 0; i <= LOGIN_MAX_ATTEMPTS; i++) await siteLogin(post('/api/login', wrong, a));
    expect((await siteLogin(post('/api/login', right, b))).status).toBe(200);
  });

  it('answers malformed JSON with 401 rather than crashing', async () => {
    const r = await siteLogin(post('/api/login', '{not json', ip(), true));
    expect(r.status).toBe(401);
  });
});

describe('POST /api/admin/login throttling', () => {
  it('locks out repeated wrong passphrases, on a budget separate from the site login', async () => {
    const c = ip();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect((await adminLogin(post('/api/admin/login', { passphrase: 'x' }, c))).status).toBe(401);
    }
    expect((await adminLogin(post('/api/admin/login', { passphrase: 'open sesame' }, c))).status).toBe(429);
    // the same client can still use the site login: separate scope
    expect((await siteLogin(post('/api/login', right, c))).status).toBe(200);
  });

  it('accepts the right passphrase', async () => {
    const r = await adminLogin(post('/api/admin/login', { passphrase: 'open sesame' }, ip()));
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('awh_admin_session=');
  });
});
