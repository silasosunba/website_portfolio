import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieOptions, supabaseConfig } from './lib/supabase/config';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set('Cache-Control', 'private, no-store');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return response;
  const { url, key } = supabaseConfig();
  const client = createServerClient(url, key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: values => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set('Cache-Control', 'private, no-store');
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...sessionCookieOptions }));
      },
    },
  });
  // Refresh and verify the session. Each page/action still performs owner authorization.
  let authenticated = false;
  if (request.cookies.getAll().some(cookie => cookie.name.startsWith('sb-'))) {
    try { const { data, error } = await client.auth.getUser(); authenticated = !error && !!data.user; }
    catch { /* The page handles unavailable auth. */ }
  }
  if (!authenticated && request.nextUrl.pathname.startsWith('/admin') && !['/admin/login', '/admin/reset-password'].includes(request.nextUrl.pathname)) {
    const login = NextResponse.redirect(new URL('/admin/login', request.url));
    response.cookies.getAll().forEach(cookie => login.cookies.set(cookie));
    login.headers.set('Cache-Control', 'private, no-store');
    return login;
  }
  return response;
}
export const config = { matcher: ['/admin/:path*', '/media/:path*'] };
