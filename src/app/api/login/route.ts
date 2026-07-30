import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, expectedSessionToken, verifyCredentials } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (typeof username !== 'string' || typeof password !== 'string' || !verifyCredentials(username, password)) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = await expectedSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
