import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "./zip";

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
interface ReadEntry {
  name: string;
  data: Uint8Array;
  method: number;
  offset: number;
}

function readZip(bytes: Uint8Array): ReadEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ReadEntry[] = [];

  // Local file header: 0x04034b50.
  let position = 0;

  while (position + 4 <= bytes.length) {
    const signature = view.getUint32(position, true);

    if (signature !== 0x04034b50) {
      break;
    }

    const method = view.getUint16(position + 8, true);
    const size = view.getUint32(position + 18, true);
    const nameLength = view.getUint16(position + 26, true);
    const extraLength = view.getUint16(position + 28, true);
    const nameStart = position + 30;
    const dataStart = nameStart + nameLength + extraLength;

    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));

    entries.push({
      name,
      data: bytes.slice(dataStart, dataStart + size),
      method,
      offset: position,
    });

    position = dataStart + size;
  }

  return entries;
}

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

  it("guarda las entradas sin comprimir", () => {
    const bytes = buildZip([entrada], new Date("2026-10-20T10:00:00.000Z"));
    const [leida] = readZip(bytes);

    expect(leida?.method).toBe(0);
    expect(new TextDecoder().decode(leida?.data)).toBe("<container/>");
  });

  it("conserva el nombre y el contenido de cada entrada", () => {
    const bytes = buildZip(
      [entrada, { name: "EPUB/package.opf", data: new TextEncoder().encode("<package/>") }],
      new Date("2026-10-20T10:00:00.000Z"),
    );

    const leidas = readZip(bytes);

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

    const leidas = readZip(bytes);

    expect(leidas[0]?.name).toBe("mimetype");
    expect(leidas[0]?.offset).toBe(0);
  });

  it("genera el mismo archivo para la misma entrada", () => {
    const fecha = new Date("2026-10-20T10:00:00.000Z");

    expect(equals(buildZip([entrada], fecha), buildZip([entrada], fecha))).toBe(true);
  });
});
