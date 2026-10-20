import { NextResponse, type NextRequest } from "next/server";

const isDevelopment = process.env.NODE_ENV !== "production";

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestId = crypto.randomUUID();
  const connectSources = ["'self'", "https://api.cloudinary.com"];

  if (isDevelopment) {
    connectSources.push("ws:", "wss:");
  }

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    // En desarrollo, las herramientas de Next.js 16 aplican estilos en línea y
    // la CSP los bloquea, lo que provoca recargas continuas del navegador.
    // La política de producción no los permite.
    `style-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("X-Request-ID", requestId);

  if (
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/account") ||
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/setup") ||
    request.nextUrl.pathname.startsWith("/reset-password")
  ) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
