import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
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
