import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken, ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from './lib/auth';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (!(await verifySessionToken(token))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /admin/** requires the site session above PLUS this separate passphrase
  // gate — being logged into the site isn't enough on its own to reach it.
  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminLoginRoute = pathname === '/admin/login' || pathname === '/api/admin/login';

  if (isAdminRoute && !isAdminLoginRoute) {
    const adminToken = request.cookies.get(ADMIN_AUTH_COOKIE)?.value;
    if (!(await verifyAdminSessionToken(adminToken))) {
      const adminLoginUrl = new URL('/admin/login', request.url);
      adminLoginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(adminLoginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/login).*)'],
};
