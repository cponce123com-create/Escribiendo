import { expect, it } from "vitest";
import { sessionRetentionWhere } from "./retention-policy";
it("borra sesiones caducadas o revocadas hace más de 30 días", () => {
  const now = new Date("2026-10-27T00:00:00Z");
  const cutoff = new Date("2026-09-27T00:00:00Z");
  expect(sessionRetentionWhere(now)).toEqual({
    OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
  });
});
