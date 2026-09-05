import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_AUTH_COOKIE, createAdminSessionToken, verifyAdminPassphrase } from '@/lib/auth';

const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

export async function POST(request: NextRequest) {
  const { passphrase } = await request.json();

  if (typeof passphrase !== 'string' || !(await verifyAdminPassphrase(passphrase))) {
    return NextResponse.json({ error: 'Invalid passphrase' }, { status: 401 });
  }

  const token = await createAdminSessionToken();
  if (!token) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return response;
}
