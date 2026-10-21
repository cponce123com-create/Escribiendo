import { NextResponse } from "next/server";
import { checkDatabaseConnection, checkSchema } from "@escribiendo/database";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const databaseReady = await checkDatabaseConnection(2_500);
  // Con la base conectada puede faltar una migración: es un estado distinto
  // de «la base no responde» y hay que decirlo.
  const schemaReady = databaseReady ? await checkSchema(2_500) : false;
  const ready = databaseReady && schemaReady;

  return NextResponse.json(
    {
      status: ready ? "ready" : "unavailable",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      checks: {
        application: "ok",
        database: databaseReady ? "ok" : "unavailable",
        schema: schemaReady ? "ok" : "outdated",
      },
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": request.headers.get("x-request-id") ?? "",
      },
    },
  );
}
