import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fileNameFor } from "./generate";

describe("fileNameFor", () => {
  it("usa la extensión propia de cada formato de texto", () => {
    expect(fileNameFor("El velo de la tarde", "MARKDOWN")).toBe("el-velo-de-la-tarde.md");
    expect(fileNameFor("El velo de la tarde", "HTML")).toBe("el-velo-de-la-tarde.html");
    expect(fileNameFor("El velo de la tarde", "TXT")).toBe("el-velo-de-la-tarde.txt");
  });

  it("conserva las extensiones de los formatos anteriores", () => {
    expect(fileNameFor("El velo de la tarde", "PDF_DIGITAL")).toBe("el-velo-de-la-tarde.pdf");
    expect(fileNameFor("El velo de la tarde", "PDF_PRINT")).toBe("el-velo-de-la-tarde.pdf");
    expect(fileNameFor("El velo de la tarde", "EPUB3")).toBe("el-velo-de-la-tarde.epub");
    expect(fileNameFor("El velo de la tarde", "DOCX")).toBe("el-velo-de-la-tarde.docx");
  });

  it("cae a un nombre genérico cuando el título no deja caracteres", () => {
    expect(fileNameFor("   ", "TXT")).toBe("libro.txt");
  });
});
