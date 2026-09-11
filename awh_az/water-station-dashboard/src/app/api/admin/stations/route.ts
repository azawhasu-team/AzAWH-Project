import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Re-checks the admin session even though middleware already gates this
// route — this is the only place that attaches ADMIN_API_KEY, so it must
// never be reachable without re-verifying who's asking.
async function requireAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_AUTH_COOKIE)?.value);
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE_URL}/admin/stations`, {
    headers: { 'X-Admin-Key': process.env.ADMIN_API_KEY || '' },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const res = await fetch(`${API_BASE_URL}/admin/stations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': process.env.ADMIN_API_KEY || '',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
