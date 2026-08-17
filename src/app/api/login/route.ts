import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, SESSION_TTL_SECONDS, createSessionToken, verifyCredentials } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (typeof username !== 'string' || typeof password !== 'string' || !(await verifyCredentials(username, password))) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

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
