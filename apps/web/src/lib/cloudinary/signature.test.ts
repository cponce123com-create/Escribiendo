import { describe, expect, it } from "vitest";
import { buildCloudinarySignature } from "./signature";

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
