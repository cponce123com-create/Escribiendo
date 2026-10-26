import { describe, expect, it } from "vitest";
import { buildCloudinarySignature, serializeCloudinaryParams } from "./signature";

describe("buildCloudinarySignature", () => {
  it("reproduce el vector publicado por Cloudinary", () => {
    expect(buildCloudinarySignature({ timestamp: "1315060510" }, "abcd")).toBe(
      "a21ad0f63beb4de2e5575204b79ab90bffb02c10",
    );
  });

  it("ordena parámetros y excluye los no firmados", () => {
    const signed = buildCloudinarySignature(
      {
        timestamp: "1700000000",
        folder: "escribiendo/workspaces/demo/covers",
        api_key: "public-key",
        file: "ignored",
      },
      "secret",
    );

    expect(signed).toHaveLength(40);
    expect(signed).not.toBe(
      buildCloudinarySignature(
        {
          timestamp: "1700000001",
          folder: "escribiendo/workspaces/demo/covers",
        },
        "secret",
      ),
    );
  });
});

describe("serializeCloudinaryParams", () => {
  it("produce la cadena que Cloudinary reportó al rechazar una portada", () => {
    expect(
      serializeCloudinaryParams({
        timestamp: "1793047216",
        folder:
          "escribiendo/workspaces/4a06c3f3-3487-4baa-9728-e8d90a90e860/books/d056942c-5475-4f5f-b566-f610e3ce7ecf/cover",
        allowed_formats: "jpg,jpeg,png,webp,avif",
        unique_filename: "true",
      }),
    ).toBe(
      "allowed_formats=jpg,jpeg,png,webp,avif&folder=escribiendo/workspaces/4a06c3f3-3487-4baa-9728-e8d90a90e860/books/d056942c-5475-4f5f-b566-f610e3ce7ecf/cover&timestamp=1793047216&unique_filename=true",
    );
  });

  it("un parámetro firmado que el cliente no envía cambia la firma", () => {
    const enviados = {
      allowed_formats: "jpg,jpeg,png,webp,avif",
      folder: "escribiendo/workspaces/demo/books/demo/cover",
      timestamp: "1793047216",
      unique_filename: "true",
    };

    expect(buildCloudinarySignature({ ...enviados, overwrite: "false" }, "secreto")).not.toBe(
      buildCloudinarySignature(enviados, "secreto"),
    );
  });
});
