import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/auth';

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  if (!(await verifyAdminSessionToken(store.get(ADMIN_AUTH_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const res = await fetch(`${API_BASE_URL}/admin/calibrations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': process.env.ADMIN_API_KEY || '' },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
