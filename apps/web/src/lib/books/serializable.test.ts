import { expect, it, vi } from "vitest";
import { withSerializableRetry } from "./serializable";
it("retries a database serialization abort with a bounded budget", async () => {
  const operation = vi.fn().mockRejectedValueOnce({ code: "P2034" }).mockResolvedValue("saved");
  expect(await withSerializableRetry(operation)).toBe("saved");
  expect(operation).toHaveBeenCalledTimes(2);
});
it("does not retry version conflicts or arbitrary database failures", async () => {
  const operation = vi.fn().mockRejectedValue(new Error("SECTION_VERSION_CONFLICT"));
  await expect(withSerializableRetry(operation)).rejects.toThrow("SECTION_VERSION_CONFLICT");
  expect(operation).toHaveBeenCalledTimes(1);
});
it("stops after three serialization failures", async () => {
  const operation = vi.fn().mockRejectedValue({ code: "P2034" });
  await expect(withSerializableRetry(operation)).rejects.toEqual({ code: "P2034" });
  expect(operation).toHaveBeenCalledTimes(3);
});
