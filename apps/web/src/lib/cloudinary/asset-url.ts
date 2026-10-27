/** Vincula una URL de entrega con el identificador exacto, sin normalizaciones ambiguas. */
export function urlCorrespondeAPublicId(
  secureUrl: string,
  publicId: string,
  cloudName: string,
): boolean {
  if (
    !publicId ||
    publicId.includes("..") ||
    /[%\\?#]/u.test(publicId) ||
    secureUrl.includes("..") ||
    /%(?:2e|25|2f|5c)/iu.test(secureUrl)
  )
    return false;
  try {
    const url = new URL(secureUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return false;
    const prefix = `/${cloudName}/image/upload/`;
    if (!url.pathname.startsWith(prefix)) return false;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const extension = /\.[a-z0-9]+$/iu.exec(path)?.[0];
    if (!extension) return false;
    const target = publicId + extension;
    const segments = path.split("/");
    const version = segments.findIndex((segment) => /^v\d+$/u.test(segment));
    const validTransform = (segment: string) =>
      /^(?:[a-z][a-z0-9]*_[A-Za-z0-9:!.$-]+)(?:,[a-z][a-z0-9]*_[A-Za-z0-9:!.$-]+)*$/u.test(segment);
    if (version >= 0) {
      return (
        segments.slice(0, version).every(validTransform) &&
        segments.slice(version + 1).join("/") === target
      );
    }
    if (path === target) return true;
    if (!path.endsWith(`/${target}`)) return false;
    return path
      .slice(0, -target.length - 1)
      .split("/")
      .every(validTransform);
  } catch {
    return false;
  }
}
