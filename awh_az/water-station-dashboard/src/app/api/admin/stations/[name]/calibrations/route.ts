import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/auth';

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Re-checks the admin session: this is where ADMIN_API_KEY gets attached.
async function requireAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_AUTH_COOKIE)?.value);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name } = await params;
  // The read endpoint is gated by the read key, not the admin key.
  const res = await fetch(`${API_BASE_URL}/stations/${encodeURIComponent(name)}/calibrations`, {
    headers: { 'X-API-Key': process.env.BACKEND_API_KEY || '' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ([]));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name } = await params;
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${API_BASE_URL}/admin/stations/${encodeURIComponent(name)}/calibrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': process.env.ADMIN_API_KEY || '' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
