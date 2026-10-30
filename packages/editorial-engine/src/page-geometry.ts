import type { PageGeometry } from "./pagination";

/** Campos de un perfil que definen la caja de composición de una página. */
export type PageGeometryProfile = Pick<
  PageGeometry,
  | "pageWidthMm"
  | "pageHeightMm"
  | "marginTopMm"
  | "marginBottomMm"
  | "marginInnerMm"
  | "marginOuterMm"
  | "gutterMm"
  | "headerDistanceMm"
  | "footerDistanceMm"
  | "chapterStartsRecto"
>;

/** Adapta el perfil persistido a la geometría compartida por la composición. */
export function pageGeometryFromProfile(profile: PageGeometryProfile): PageGeometry {
  return {
    pageWidthMm: profile.pageWidthMm,
    pageHeightMm: profile.pageHeightMm,
    marginTopMm: profile.marginTopMm,
    marginBottomMm: profile.marginBottomMm,
    marginInnerMm: profile.marginInnerMm,
    marginOuterMm: profile.marginOuterMm,
    gutterMm: profile.gutterMm,
    headerDistanceMm: profile.headerDistanceMm,
    footerDistanceMm: profile.footerDistanceMm,
    chapterStartsRecto: profile.chapterStartsRecto,
  };
}
