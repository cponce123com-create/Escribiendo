import { describe, expect, it } from "vitest";
import { buildAuditCsv, campo } from "./audit-csv";

// Analizador de CSV que respeta comas, comillas y saltos dentro de campos.
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [[]];
  let field = "";
  let quoted = false;
  const source = csv.replace(/^\uFEFF/u, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      rows.at(-1)!.push(field);
      field = "";
      if (char === "\n") rows.push([]);
    } else field += char;
  }
  rows.at(-1)!.push(field);
  return rows;
}

describe("CSV de auditoría", () => {
  it("alinea todas las columnas y conserva BOM, saltos y comillas", () => {
    const row = {
      createdAt: new Date("2026-01-01Z"),
      action: "EDIT",
      entityType: "Book",
      entityId: "libro",
      requestId: "solicitud",
      actor: { name: '=HYPERLINK("http://x","y")', email: "a@b.test" },
      metadata: { detalle: 'texto, "citado"\ny otra línea' },
    };
    const original = JSON.stringify(row);
    const csv = buildAuditCsv([row, { ...row, actor: null, metadata: null }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([
      "fecha",
      "accion",
      "tipo",
      "entidad_id",
      "solicitud",
      "persona",
      "correo",
      "detalle",
    ]);
    expect(rows.every((r) => r.length === 8)).toBe(true);
    expect(rows[1]?.[4]).toBe("solicitud");
    expect(rows[1]?.[5]).toBe("'" + row.actor.name);
    expect(JSON.parse(rows[1]![7]!)).toEqual(row.metadata);
    expect(JSON.stringify(row)).toBe(original);
  });
  it.each(["=x", "+x", "-x", "@x", "\tx", "\rx"])("neutraliza %j", (value) => {
    expect(parseCsv(campo(value))[0]?.[0]).toBe("'" + value);
  });
  it("oculta secretos y no altera fechas ISO", () => {
    expect(campo("postgresql://usuario:secreto@host/db")).not.toContain("secreto");
    expect(campo("2026-01-01T00:00:00.000Z")).toBe('"2026-01-01T00:00:00.000Z"');
  });
});
