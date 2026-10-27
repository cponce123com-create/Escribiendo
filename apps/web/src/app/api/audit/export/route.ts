import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { assertCanPerform } from "@/lib/books/permissions";
import { buildAuditCsv } from "@/lib/auth/audit-csv";

/**
 * Exportación del registro de auditoría.
 *
 * Devuelve un CSV con las acciones del estudio. El registro no contiene
 * contenido de manuscritos, contraseñas ni tokens, pero sí quién hizo qué, así
 * que solo lo puede exportar quien administra el estudio.
 */

export const dynamic = "force-dynamic";

/** Número máximo de registros que se exportan de una vez. */
const MAX_ROWS = 5_000;

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No hay sesión." }, { status: 401 });
  }

  try {
    assertCanPerform(session.workspace.role, "audit:export");
  } catch {
    return NextResponse.json(
      { error: "No tienes permisos para exportar la auditoría." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const formato = url.searchParams.get("format") === "json" ? "json" : "csv";

  const registros = await prisma.auditLog.findMany({
    where: { workspaceId: session.workspace.id },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      createdAt: true,
      action: true,
      entityType: true,
      entityId: true,
      requestId: true,
      metadata: true,
      actor: { select: { name: true, email: true } },
    },
  });

  if (formato === "json") {
    return new NextResponse(
      JSON.stringify(
        {
          workspace: session.workspace.name,
          generatedAt: new Date().toISOString(),
          rows: registros,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=auditoria.json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const csv = buildAuditCsv(registros);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=auditoria.csv",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
