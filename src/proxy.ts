import { NextResponse, type NextRequest } from "next/server";
import { loginRedirectFor, requiresSession } from "@/app/_shared/route-access";
import { hasSessionCookie } from "@/infrastructure/auth/session-cookie";

/**
 * Optimistic route protection: pre-filters visitors without a session cookie. It is not the security
 * boundary (the layout guard and the use cases are), so a stale cookie is let through on purpose.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (requiresSession(pathname) && !hasSessionCookie(request.headers)) {
    return NextResponse.redirect(new URL(loginRedirectFor(pathname, search), request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/boards/:path*", "/dashboard/:path*"],
};
