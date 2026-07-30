import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const [, encoded] = authHeader.split(' ');
    const [user, pwd] = atob(encoded).split(':');

    if (user === process.env.DASHBOARD_USER && pwd === process.env.DASHBOARD_PASSWORD) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="AzAWH Dashboard"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
