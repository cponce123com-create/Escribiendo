import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  suggestion: vi.fn(),
  book: vi.fn(),
  source: vi.fn(),
  existing: vi.fn(),
  claim: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./action-helpers", () => ({
  beginStoryAction: mocks.start,
  storyBookExists: mocks.book,
  logStoryError: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    storyCharacterSuggestion: { findFirst: mocks.suggestion },
    bookSection: { findFirst: mocks.source },
    storyCharacter: { findMany: mocks.existing },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        storyCharacterSuggestion: { updateMany: mocks.claim, update: mocks.save },
        storyCharacter: { create: mocks.create },
      }),
  },
}));
import { reviewCharacterSuggestion } from "./character-intelligence-actions";
import { verifyCharacterNames } from "./character-name-verifier";
const id = "11111111-1111-4111-8111-111111111111",
  content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Andrés Salazar llegó. Andrés Salazar volvió." }],
      },
    ],
  };
const verified = verifyCharacterNames([
  { title: "I", text: "Andrés Salazar llegó. Andrés Salazar volvió." },
])[0]!;
const proposal = {
  id,
  bookId: id,
  sectionId: id,
  stale: false,
  status: "PENDING",
  contentHash: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
  suggestedName: verified.name,
  nameVerification: verified.nameVerification,
};
const form = () => {
  const fd = new FormData();
  fd.set("suggestionId", id);
  fd.set("decision", "accept");
  return fd;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockResolvedValue({
    ok: true,
    session: { workspace: { id: "workspace", role: "AUTHOR" }, user: { id: "user" } },
    context: {},
  });
  mocks.suggestion.mockResolvedValue(proposal);
  mocks.book.mockResolvedValue(true);
  mocks.source.mockResolvedValue({ content });
  mocks.existing.mockResolvedValue([]);
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.create.mockResolvedValue({ id: "created" });
});
it("no acepta propuestas antiguas o desactualizadas", async () => {
  mocks.suggestion.mockResolvedValueOnce({ ...proposal, nameVerification: null });
  expect((await reviewCharacterSuggestion({ status: "idle" }, form())).status).toBe("error");
  mocks.suggestion.mockResolvedValueOnce({ ...proposal, stale: true });
  expect((await reviewCharacterSuggestion({ status: "idle" }, form())).status).toBe("error");
  mocks.source.mockResolvedValueOnce({ content: { type: "doc", content: [] } });
  expect((await reviewCharacterSuggestion({ status: "idle" }, form())).status).toBe("error");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("no fusiona automáticamente una ficha ya existente", async () => {
  mocks.existing.mockResolvedValue([{ id: "existing", name: "Andrés Salazar" }]);
  const result = await reviewCharacterSuggestion({ status: "idle" }, form());
  expect(result.message).toContain("Fusionar");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("una revisión concurrente no crea dos fichas", async () => {
  mocks.claim.mockResolvedValue({ count: 0 });
  expect((await reviewCharacterSuggestion({ status: "idle" }, form())).status).toBe("error");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("la aceptación explícita crea la ficha una sola vez", async () => {
  expect((await reviewCharacterSuggestion({ status: "idle" }, form())).status).toBe("success");
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
