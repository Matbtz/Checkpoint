import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const isAuth = !!token;
  const isAuthPage = req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/register');
  const isRootPage = req.nextUrl.pathname === '/';

  // If user is authenticated and tries to access login/register or root, redirect to dashboard
  if (isAuth && (isAuthPage || isRootPage)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // If user is NOT authenticated and tries to access protected routes, redirect to login
  const isProtectedPath = req.nextUrl.pathname.startsWith('/dashboard') || req.nextUrl.pathname.startsWith('/import');

  if (!isAuth && isProtectedPath) {
    let from = req.nextUrl.pathname;
    if (req.nextUrl.search) {
      from += req.nextUrl.search;
    }
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(from)}`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/dashboard/:path*', '/import/:path*'],
};
