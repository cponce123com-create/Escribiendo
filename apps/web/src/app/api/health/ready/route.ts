import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@escribiendo/database";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const databaseReady = await checkDatabaseConnection(2_500);

  return NextResponse.json(
    {
      status: databaseReady ? "ready" : "unavailable",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      checks: {
        application: "ok",
        database: databaseReady ? "ok" : "unavailable",
      },
    },
    {
      status: databaseReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": request.headers.get("x-request-id") ?? "",
      },
    },
  );
}
