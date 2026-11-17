import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 proxy (formerly middleware): refreshes the Supabase session on each request so
 * Server Components always see a valid access token, and redirects signed-out visitors
 * away from owner pages.
 *
 * Kept self-contained (no app module imports) as the proxy docs recommend.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Responses that set auth cookies must never be cached by a CDN.
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Validates the JWT and refreshes it if needed. Do not put logic between client
  // creation and this call: a stale token here can log users out at random.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; is_anonymous?: boolean } | undefined;

  const isOwnerArea = request.nextUrl.pathname.startsWith("/forms");
  if (isOwnerArea && (!claims?.sub || claims.is_anonymous)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    const redirect = NextResponse.redirect(signIn);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
