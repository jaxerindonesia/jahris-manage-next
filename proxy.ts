import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyEdgeSessionToken } from "@/lib/auth/jwt-edge";
import { getExpiredAuthCookieOptions } from "@/lib/auth/cookie";
import { isStateChangingRequest, isTrustedOrigin } from "@/lib/security/origin";

const cspBase =
  "default-src 'self'; img-src 'self' data: blob: http://103.31.204.110:1608 https://s3-jaxer.tetrabit.my.id https://s3.jahris.id; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://s3-jaxer.tetrabit.my.id https://s3.jahris.id; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const createNonce = () => crypto.randomUUID().replace(/-/g, "");

const applyCspHeaders = (response: NextResponse, nonce: string) => {
  const csp = `${cspBase}; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);
};

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const token = request.cookies.get("token")?.value || bearerToken;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/models/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return response;
  }

  if (pathname.startsWith("/api/cron")) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    applyCspHeaders(response, nonce);
    return response;
  }

  const publicRoutes = ["/login", "/register"];
  const authApiRoutes = ["/api/auth/login", "/api/auth/register"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  const isAuthApiRoute = authApiRoutes.some((route) => pathname.startsWith(route));
  const isApiRoute = pathname.startsWith("/api/");
  const jwtSecret = process.env.JWT_SECRET;

  let isValidSession = false;
  if (token && jwtSecret) {
    const payload = await verifyEdgeSessionToken(token, jwtSecret);
    isValidSession = Boolean(payload?.sub);
  }

  if (isValidSession && publicRoutes.includes(pathname)) {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    applyCspHeaders(response, nonce);
    return response;
  }

  if (isPublicRoute || isAuthApiRoute) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    applyCspHeaders(response, nonce);
    return response;
  }

  if (isApiRoute && isStateChangingRequest(request.method) && !isTrustedOrigin(request)) {
    const response = NextResponse.json(
      { message: "Forbidden origin" },
      { status: 403 },
    );
    applyCspHeaders(response, nonce);
    return response;
  }

  if (!token || !isValidSession) {
    if (isApiRoute) {
      const response = NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      if (request.cookies.get("token")?.value) {
        response.cookies.set("token", "", getExpiredAuthCookieOptions());
        response.cookies.set("remember_me", "", getExpiredAuthCookieOptions());
      }
      applyCspHeaders(response, nonce);
      return response;
    }

    const response = NextResponse.redirect(new URL("/login", request.url));
    if (request.cookies.get("token")?.value) {
      response.cookies.set("token", "", getExpiredAuthCookieOptions());
      response.cookies.set("remember_me", "", getExpiredAuthCookieOptions());
    }
    applyCspHeaders(response, nonce);
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  applyCspHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|models/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)",
  ],
};
