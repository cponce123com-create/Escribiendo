import { describe, expect, it } from "vitest";
import { bookAssetThumbnailUrl } from "./asset-thumbnail";

const base =
  "https://res.cloudinary.com/demo/image/upload/v1710000000/escribiendo/books/abc/foto.jpg";

describe("bookAssetThumbnailUrl", () => {
  it("inserta el recorte y el formato optimizado sin tocar el public_id", () => {
    expect(bookAssetThumbnailUrl(base)).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_320,h_240/f_auto,q_auto:good/v1710000000/escribiendo/books/abc/foto.jpg",
    );
  });

  it("deja intacta una URL que no es de Cloudinary", () => {
    expect(bookAssetThumbnailUrl("https://example.com/foto.jpg?x=1")).toBe(
      "https://example.com/foto.jpg?x=1",
    );
  });

  it("no altera una cadena vacía", () => {
    expect(bookAssetThumbnailUrl("")).toBe("");
  });
});
