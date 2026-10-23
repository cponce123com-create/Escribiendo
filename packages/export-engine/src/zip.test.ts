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

  it("guarda y recupera una entrada grande sin perder bytes", () => {
    const grande = new Uint8Array(2 * 1024 * 1024);

    for (let indice = 0; indice < grande.length; indice += 1) {
      grande[indice] = (indice * 7) & 0xff;
    }

    const bytes = buildZip(
      [{ name: "word/media/grande.bin", data: grande }],
      new Date("2026-10-20T10:00:00.000Z"),
    );
    const [leida] = [...zipEntries(bytes).values()];

    expect(leida?.data.length).toBe(grande.length);
    expect(leida?.data[1234]).toBe(grande[1234]);
    expect(leida?.data[grande.length - 1]).toBe(grande[grande.length - 1]);
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

it("stores already-compressed illustrations byte-for-byte while compressing text", () => {
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const zip = buildZip(
    [
      { name: "word/media/photo.png", data: image },
      { name: "word/document.xml", data: new TextEncoder().encode("<p>Text</p>") },
    ],
    new Date("2026-10-23T00:00:00Z"),
  );
  const entries = [...zipEntries(zip).values()];
  expect(entries[0]?.method).toBe(0);
  expect(entries[0]?.data).toEqual(image);
  expect(entries[1]?.method).toBe(8);
});
