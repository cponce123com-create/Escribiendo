import { expect, it } from "vitest";
import { coverAssetVersion } from "./asset-identity";
const id = "studio/workspaces/w/books/b/cover/photo";
it("keeps a versioned cover identity", () => {
  expect(
    coverAssetVersion(
      `https://res.cloudinary.com/demo/image/upload/v123/${id}.jpg`,
      "demo",
      id,
      "jpg",
    ),
  ).toBe("123");
});
it("rejects a URL belonging to another book even if the declared ID is valid", () => {
  expect(
    coverAssetVersion(
      `https://res.cloudinary.com/demo/image/upload/v123/other.jpg`,
      "demo",
      id,
      "jpg",
    ),
  ).toBeNull();
});
it("rejects mutable URLs, transformations and other accounts", () => {
  for (const suffix of [`${id}.jpg`, `c_fill/v123/${id}.jpg`, `v123/${id}.png`]) {
    expect(
      coverAssetVersion(
        `https://res.cloudinary.com/demo/image/upload/${suffix}`,
        "demo",
        id,
        "jpg",
      ),
    ).toBeNull();
  }
  expect(
    coverAssetVersion(
      `https://res.cloudinary.com/other/image/upload/v123/${id}.jpg`,
      "demo",
      id,
      "jpg",
    ),
  ).toBeNull();
});
