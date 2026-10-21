import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "./zip";
import { zipEntries } from "./test-utils";

/** Compara dos arreglos de bytes sin depender de los tipos de Node. */
function equals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/** Lector de ZIP mínimo, para comprobar que lo que se genera es legible. */
describe("crc32", () => {
  it("devuelve el valor conocido de la cadena de prueba", () => {
    // Valor de referencia de la especificación ZIP.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("devuelve cero para una entrada vacía", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("buildZip", () => {
  const entrada = {
    name: "META-INF/container.xml",
    data: new TextEncoder().encode("<container/>"),
  };

  it("produce un archivo que empieza por la firma ZIP", () => {
    const bytes = buildZip([entrada], new Date("2026-10-20T10:00:00.000Z"));

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  it("comprime las entradas y conserva su contenido", () => {
    const bytes = buildZip([entrada], new Date("2026-10-20T10:00:00.000Z"));
    const [leida] = [...zipEntries(bytes).values()];

    expect(leida?.method).toBe(8);
    expect(new TextDecoder().decode(leida?.data)).toBe("<container/>");
  });

  it("deja la entrada marcada como primera sin comprimir", () => {
    const bytes = buildZip(
      [
        { name: "mimetype", data: new TextEncoder().encode("application/epub+zip"), first: true },
        entrada,
      ],
      new Date("2026-10-20T10:00:00.000Z"),
    );
    const [primera] = [...zipEntries(bytes).values()];

    expect(primera?.name).toBe("mimetype");
    expect(primera?.method).toBe(0);
    expect(new TextDecoder().decode(primera?.data)).toBe("application/epub+zip");
  });

  it("reduce el tamaño del archivo cuando el contenido se repite", () => {
    const largo = new TextEncoder().encode("<container/>".repeat(200));
    const bytes = buildZip(
      [{ name: "EPUB/text/largo.xhtml", data: largo }],
      new Date("2026-10-20T10:00:00.000Z"),
    );

    expect(bytes.length).toBeLessThan(largo.length);
  });

  it("conserva el nombre y el contenido de cada entrada", () => {
    const bytes = buildZip(
      [entrada, { name: "EPUB/package.opf", data: new TextEncoder().encode("<package/>") }],
      new Date("2026-10-20T10:00:00.000Z"),
    );

    const leidas = [...zipEntries(bytes).values()];

    expect(leidas.map((item) => item.name)).toEqual(["META-INF/container.xml", "EPUB/package.opf"]);
    expect(new TextDecoder().decode(leidas[1]?.data)).toBe("<package/>");
  });

  it("coloca la entrada marcada como primera al principio del archivo", () => {
    const bytes = buildZip(
      [
        { name: "mimetype", data: new TextEncoder().encode("application/epub+zip"), first: true },
        entrada,
      ],
      new Date("2026-10-20T10:00:00.000Z"),
    );

    const leidas = [...zipEntries(bytes).values()];

    expect(leidas[0]?.name).toBe("mimetype");
    expect(leidas[0]?.offset).toBe(0);
  });

  it("genera el mismo archivo para la misma entrada", () => {
    const fecha = new Date("2026-10-20T10:00:00.000Z");

    expect(equals(buildZip([entrada], fecha), buildZip([entrada], fecha))).toBe(true);
  });
});
