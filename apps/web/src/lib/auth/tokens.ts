import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function secureCompareTokens(received: string, expected: string): boolean {
  const receivedHash = createHash("sha256").update(received, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();

  return timingSafeEqual(receivedHash, expectedHash);
}
