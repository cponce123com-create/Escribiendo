import { createHash } from "node:crypto";

const EXCLUDED_FROM_SIGNATURE = new Set([
  "file",
  "api_key",
  "cloud_name",
  "resource_type",
  "signature",
]);

export type CloudinaryUploadParams = Record<string, string>;

/**
 * Cadena que Cloudinary firma: parámetros ordenados por nombre, unidos con `&`
 * y sin los campos que no forman parte de la firma.
 */
export function serializeCloudinaryParams(params: CloudinaryUploadParams): string {
  return Object.entries(params)
    .filter(([key, value]) => !EXCLUDED_FROM_SIGNATURE.has(key) && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function buildCloudinarySignature(
  params: CloudinaryUploadParams,
  apiSecret: string,
): string {
  return createHash("sha1")
    .update(`${serializeCloudinaryParams(params)}${apiSecret}`, "utf8")
    .digest("hex");
}
