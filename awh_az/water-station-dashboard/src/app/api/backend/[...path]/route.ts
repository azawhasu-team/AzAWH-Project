import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth';
import { forwardToBackend } from '@/lib/backendProxy';

// Slow wide-range reads and exports run for a while on the backend.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const store = await cookies();
  // proxy.ts already requires a session for this route; re-check here since this
  // is the one place that attaches the backend key.
  const sessionOk = await verifySessionToken(store.get(AUTH_COOKIE)?.value);
  return forwardToBackend(request, path, {
    sessionOk,
    backendUrl: process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    apiKey: process.env.BACKEND_API_KEY,
  });
}

export const GET = handle;
export const POST = handle;
