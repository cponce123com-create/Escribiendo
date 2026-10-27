import { scrubSecrets } from "@escribiendo/shared";

export interface AuditCsvRow {
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  actor: { name: string; email: string } | null;
  metadata: unknown;
}

/** Escapa CSV y neutraliza fórmulas antes de abrirlo en una hoja de cálculo. */
export function campo(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const clean = scrubSecrets(text);
  const safe = /^[=+\-@\t\r]/u.test(clean) ? `'${clean}` : clean;
  return `"${safe.replace(/"/gu, '""')}"`;
}

const columns: { cabecera: string; valor: (row: AuditCsvRow) => unknown }[] = [
  { cabecera: "fecha", valor: (row) => row.createdAt.toISOString() },
  { cabecera: "accion", valor: (row) => row.action },
  { cabecera: "tipo", valor: (row) => row.entityType },
  { cabecera: "entidad_id", valor: (row) => row.entityId },
  { cabecera: "solicitud", valor: (row) => row.requestId },
  { cabecera: "persona", valor: (row) => row.actor?.name },
  { cabecera: "correo", valor: (row) => row.actor?.email },
  { cabecera: "detalle", valor: (row) => row.metadata },
];

export function buildAuditCsv(rows: readonly AuditCsvRow[]): string {
  return `\uFEFF${[
    columns.map((column) => column.cabecera).join(","),
    ...rows.map((row) => columns.map((column) => campo(column.valor(row))).join(",")),
  ].join("\n")}`;
}
