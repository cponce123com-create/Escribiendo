import { describe, expect, it } from "vitest";
import { readExportLayoutSnapshot } from "./layout-snapshot";

describe("instantánea de exportación", () => {
  it("recupera la opción de letra capital del trabajo", () => {
    const snapshot = readExportLayoutSnapshot({
      layout: {
        profile: null,
        typography: {},
        runningHeadTemplate: null,
        bookTitle: "Libro de prueba",
        dropCaps: true,
      },
    });

    expect(snapshot?.dropCaps).toBe(true);
  });

  it("mantiene desactivada la letra capital en instantáneas antiguas", () => {
    const snapshot = readExportLayoutSnapshot({
      layout: {
        profile: null,
        typography: {},
        runningHeadTemplate: null,
        bookTitle: "Libro anterior",
      },
    });

    expect(snapshot?.dropCaps).toBe(false);
    expect(readExportLayoutSnapshot({ options: {} })).toBeNull();
  });
});
