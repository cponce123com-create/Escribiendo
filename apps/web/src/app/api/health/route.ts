import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sonda de vida. No expone versión, commit ni uptime: son datos internos de
 * despliegue y no hacen falta para que Render compruebe que el proceso vive.
 */
export function GET(request: Request): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: {
        application: "ok",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": request.headers.get("x-request-id") ?? "",
      },
    },
  );
}
