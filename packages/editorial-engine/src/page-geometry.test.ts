import { describe, expect, it } from "vitest";
import { pageGeometryFromProfile } from "./page-geometry";

describe("pageGeometryFromProfile", () => {
  it("usa la misma geometría efectiva para todos los compositores", () => {
    expect(
      pageGeometryFromProfile({
        pageWidthMm: 148,
        pageHeightMm: 210,
        marginTopMm: 18,
        marginBottomMm: 20,
        marginInnerMm: 19,
        marginOuterMm: 14,
        gutterMm: 4,
        headerDistanceMm: 8,
        footerDistanceMm: 10,
        chapterStartsRecto: true,
      }),
    ).toEqual({
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 18,
      marginBottomMm: 20,
      marginInnerMm: 19,
      marginOuterMm: 14,
      gutterMm: 4,
      headerDistanceMm: 8,
      footerDistanceMm: 10,
      chapterStartsRecto: true,
    });
  });
});
