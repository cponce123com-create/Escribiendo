export interface CoverCrop {
  x: number;
  y: number;
  zoom: number;
}

export interface BookCoverSummary {
  id: string;
  assetId: string;
  url: string;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  originalFilename: string | null;
  createdAt: string;
  crop: CoverCrop;
}

export const DEFAULT_CROP: CoverCrop = { x: 50, y: 50, zoom: 1 };

export function coverObjectPosition(crop: CoverCrop): string {
  return `${crop.x}% ${crop.y}%`;
}
