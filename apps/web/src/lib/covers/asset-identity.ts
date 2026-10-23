/** Accept only the original, versioned asset belonging to the declared public ID. */
export function coverAssetVersion(
  url: string,
  cloudName: string,
  publicId: string,
  format: string,
): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "res.cloudinary.com" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.search ||
      parsed.hash
    )
      return null;
    const prefix = `/${cloudName}/image/upload/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    const match = /^v(\d+)\/(.+)$/u.exec(path);
    if (!match || match[2] !== `${publicId}.${format}`) return null;
    return match[1] ?? null;
  } catch {
    return null;
  }
}
