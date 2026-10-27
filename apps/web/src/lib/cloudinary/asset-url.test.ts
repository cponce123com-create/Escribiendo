import { expect, it } from "vitest";
import { urlCorrespondeAPublicId } from "./asset-url";
const id = "escribiendo/workspaces/w/books/b/interior/foto";
const root = "https://res.cloudinary.com/demo/image/upload/";
it.each([`v123/${id}.jpg`, `c_fill,w_300/v123/${id}.png`, `${id}.webp`])(
  "acepta la identidad exacta: %s",
  (path) => {
    expect(urlCorrespondeAPublicId(root + path, id, "demo")).toBe(true);
  },
);
it.each([
  "v123/otro/workspace/foto.jpg",
  `v123/prefijo/${id}.jpg`,
  `v123/${id}extra.jpg`,
  `v123/${id}/../foto.jpg`,
  `v123/${id}/%2e%2e/foto.jpg`,
  `v123/${id}/%252e%252e/foto.jpg`,
  `v123/${id}.jpg?otra=1`,
])("rechaza otro activo o ruta ambigua: %s", (path) => {
  expect(urlCorrespondeAPublicId(root + path, id, "demo")).toBe(false);
});
it("rechaza otra cuenta y versiones que no delimitan el identificador", () => {
  expect(urlCorrespondeAPublicId(root + `v1/${id}.jpg`, id, "otro")).toBe(false);
  expect(urlCorrespondeAPublicId(root + `v1/otra/v2/${id}.jpg`, id, "demo")).toBe(false);
});
