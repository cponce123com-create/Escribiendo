import { expect, it } from "vitest";
import sharp from "sharp";
import { prepareImageAsset, type ImageTarget } from "./image-processing";

it.each<ImageTarget>(["pdf", "epub", "docx"])(
  "normaliza %s con bytes propios, dimensiones y transparencia compatibles",
  async (target) => {
    const input = await sharp({
      create: { width: 8, height: 4, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const asset = await prepareImageAsset(input, target);
    expect(asset?.mimeType).toBe(target === "pdf" ? "image/jpeg" : "image/png");
    expect(asset?.width).toBe(8);
    expect(asset?.height).toBe(4);
    const saved = new Uint8Array(asset!.data);
    input.fill(0);
    expect(asset?.data).toEqual(saved);
    const metadata = await sharp(asset!.data).metadata();
    expect(metadata.width).toBe(8);
    expect(metadata.hasAlpha).toBe(target !== "pdf");
  },
);

it("mantiene el límite de resolución y rechaza datos dañados", async () => {
  const input = await sharp({
    create: { width: 5000, height: 100, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  expect((await prepareImageAsset(input, "pdf"))?.width).toBe(2400);
  expect(await prepareImageAsset(new Uint8Array([1, 2, 3]), "pdf")).toBeNull();
});
