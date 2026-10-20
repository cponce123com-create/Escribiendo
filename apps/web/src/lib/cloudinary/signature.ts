import { createHash } from "node:crypto";

const EXCLUDED_FROM_SIGNATURE = new Set([
  "file",
  "api_key",
  "cloud_name",
  "resource_type",
  "signature",
]);

export type CloudinaryUploadParams = Record<string, string>;

export function buildCloudinarySignature(
  params: CloudinaryUploadParams,
  apiSecret: string,
): string {
  const serialized = Object.entries(params)
    .filter(([key, value]) => !EXCLUDED_FROM_SIGNATURE.has(key) && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${serialized}${apiSecret}`, "utf8").digest("hex");
}
