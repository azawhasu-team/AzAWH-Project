import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, SESSION_TTL_SECONDS, createSessionToken, verifyCredentials } from '@/lib/auth';
import { guardLogin } from '@/lib/loginGuard';

export async function POST(request: NextRequest) {
  // Count the attempt first; over-budget callers never reach the credential check.
  const guard = await guardLogin(request, 'login');
  if (guard.blocked) return guard.blocked;

  const body = await request.json().catch(() => null);
  const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown };

  if (typeof username !== 'string' || typeof password !== 'string' || !(await verifyCredentials(username, password))) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  await guard.succeeded();
  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
