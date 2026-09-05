import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function requireAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_AUTH_COOKIE)?.value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  const formData = await request.formData();

  const res = await fetch(`${API_BASE_URL}/admin/stations/${encodeURIComponent(name)}/image`, {
    method: 'POST',
    headers: {
      'X-Admin-Key': process.env.ADMIN_API_KEY || '',
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
