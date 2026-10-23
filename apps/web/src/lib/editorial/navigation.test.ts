import { expect, it } from "vitest";
import { sectionNavigationHref, editorialGalleryHref, editorialMatterKind } from "./navigation";
it("copyright e índice antiguos llevan a la galería conservando la referencia al contenido", () => {
  expect(sectionNavigationHref("book", { id: "legal", type: "COPYRIGHT" })).toBe(
    "/books/book/edicion?legacySection=legal#legal-title",
  );
  expect(sectionNavigationHref("book", { id: "toc", type: "TABLE_OF_CONTENTS" })).toBe(
    "/books/book/edicion?legacySection=toc#toc-title",
  );
  expect(editorialGalleryHref("book", "toc")).toBe("/books/book/edicion#toc-title");
});
it("los capítulos y dedicatorias conservan su editor", () => {
  for (const type of ["CHAPTER", "DEDICATION", "CUSTOM"])
    expect(sectionNavigationHref("book", { id: "section", type })).toBe(
      "/books/book/sections/section",
    );
  expect(editorialMatterKind("CHAPTER")).toBeNull();
});
