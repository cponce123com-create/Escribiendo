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

  it("recupera el título, el autor y la portada capturados", () => {
    const snapshot = readExportLayoutSnapshot({
      layout: {
        profile: null,
        typography: { body: "serif" },
        runningHeadTemplate: null,
        bookTitle: "Título congelado",
        authorName: "Autora congelada",
        dropCaps: false,
        cover: {
          url: "https://cdn.example.com/portada.jpg",
          crop: { x: 10, y: 20, zoom: 1.5 },
        },
      },
    });

    expect(snapshot?.bookTitle).toBe("Título congelado");
    expect(snapshot?.authorName).toBe("Autora congelada");
    expect(snapshot?.hasCoverSnapshot).toBe(true);
    expect(snapshot?.cover).toEqual({
      url: "https://cdn.example.com/portada.jpg",
      crop: { x: 10, y: 20, zoom: 1.5 },
    });
  });

  it("distingue «sin portada» de «instantánea antigua»", () => {
    const sinPortada = readExportLayoutSnapshot({
      layout: {
        profile: null,
        typography: {},
        runningHeadTemplate: null,
        bookTitle: "Libro",
        authorName: "Autor",
        cover: null,
      },
    });
    const antigua = readExportLayoutSnapshot({
      layout: {
        profile: null,
        typography: {},
        runningHeadTemplate: null,
        bookTitle: "Libro",
      },
    });

    expect(sinPortada?.hasCoverSnapshot).toBe(true);
    expect(sinPortada?.cover).toBeNull();
    expect(antigua?.hasCoverSnapshot).toBe(false);
    expect(antigua?.cover).toBeNull();
  });

  it("acota el recorte de la portada al rango válido", () => {
    const snapshot = readExportLayoutSnapshot({
      layout: {
        profile: null,
        typography: {},
        runningHeadTemplate: null,
        bookTitle: "Libro",
        cover: {
          url: "https://cdn.example.com/portada.jpg",
          crop: { x: -20, y: 140, zoom: 9 },
        },
      },
    });

    expect(snapshot?.cover?.crop).toEqual({ x: 0, y: 100, zoom: 3 });
  });

  it("descarta una portada sin URL válida", () => {
    const snapshot = readExportLayoutSnapshot({
      layout: {
        profile: null,
        typography: {},
        runningHeadTemplate: null,
        bookTitle: "Libro",
        cover: { url: "", crop: { x: 50, y: 50, zoom: 1 } },
      },
    });

    expect(snapshot?.hasCoverSnapshot).toBe(true);
    expect(snapshot?.cover).toBeNull();
  });
});
