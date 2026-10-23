import { describe, expect, it } from "vitest";
import { cloudinaryCoverUrl, cloudinaryOriginalUrl, cloudinaryPdfCoverUrl } from "./cloudinary-url";

const base =
  "https://res.cloudinary.com/demo/image/upload/v1710000000/escribiendo/books/abc/cover.jpg";

describe("cloudinaryCoverUrl", () => {
  it("inserta el recorte y el tamaño editorial", () => {
    const url = cloudinaryCoverUrl(base, {
      crop: { x: 100, y: 200, width: 800, height: 1280 },
      width: 1600,
      height: 2560,
    });

    expect(url).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_crop,x_100,y_200,w_800,h_1280/c_fill,w_1600,h_2560/f_auto,q_auto/v1710000000/escribiendo/books/abc/cover.jpg",
    );
  });

  it("usa relleno centrado vertical cuando no hay recorte", () => {
    const url = cloudinaryCoverUrl(base, { width: 400, height: 640 });
    expect(url).toContain("c_fill,ar_5:8,w_400,h_640");
  });

  it("pide JPG para el PDF", () => {
    const url = cloudinaryPdfCoverUrl(base);
    expect(url).toContain("f_jpg,q_90");
    expect(url).toContain("w_1600,h_2560");
  });

  it("elimina query strings y no toca URLs ajenas a Cloudinary", () => {
    expect(cloudinaryOriginalUrl(`${base}?foo=bar`)).toBe(base);
    expect(cloudinaryCoverUrl("https://example.com/cover.jpg")).toBe(
      "https://example.com/cover.jpg",
    );
  });
});
