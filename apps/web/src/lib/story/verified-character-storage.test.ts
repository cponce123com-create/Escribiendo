import { beforeEach, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
const mocks = vi.hoisted(() => ({
  previous: vi.fn(),
  versions: vi.fn(),
  stale: vi.fn(),
  upsert: vi.fn(),
  tasks: vi.fn(),
  active: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    storyCharacterSuggestion: { findMany: mocks.previous },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        bookSection: { findMany: mocks.versions },
        storyCharacterSuggestion: { updateMany: mocks.stale, upsert: mocks.upsert },
        characterAnalysisTask: { updateMany: mocks.tasks, findFirst: mocks.active },
      }),
  },
}));
import { persistVerifiedCharacters } from "./verified-character-storage";
import { verifyCharacterNames } from "./character-name-verifier";
const session = { user: { id: "user" }, workspace: { id: "workspace" } } as SessionContext;
const sources = [{ id: "section", version: 2, contentHash: "snapshot" }];
const candidates = () =>
  verifyCharacterNames([
    {
      id: "section",
      title: "I",
      text: "José Peña llegó. José Peña volvió. Jose Pena llegó. Jose Pena volvió.",
    },
  ]);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.previous.mockResolvedValue([]);
  mocks.versions.mockResolvedValue([{ id: "section", version: 2 }]);
  mocks.active.mockResolvedValue({ id: "task" });
});
it("mantiene separadas identidades con tildes y ñ en la clave persistida", async () => {
  expect(await persistVerifiedCharacters(session, "book", sources, candidates())).toBe(2);
  const keys = mocks.upsert.mock.calls.map(
    ([data]) => data.where.bookId_normalizedName.normalizedName,
  );
  expect(new Set(keys).size).toBe(2);
  expect(
    mocks.upsert.mock.calls.every(
      ([data]) => data.create.nameVerification.algorithm === "personal-names-2.0",
    ),
  ).toBe(true);
});
it("conserva la clave histórica de una decisión descartada sin volver a abrirla", async () => {
  mocks.previous.mockResolvedValue([
    { suggestedName: "José Peña", normalizedName: "jose pena", status: "DISCARDED" },
  ]);
  await persistVerifiedCharacters(
    session,
    "book",
    sources,
    candidates().filter((c) => c.name === "José Peña"),
  );
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { bookId_normalizedName: { bookId: "book", normalizedName: "jose pena" } },
      update: expect.not.objectContaining({ status: expect.anything() }),
    }),
  );
});
it("no publica propuestas de una versión que cambió durante el análisis", async () => {
  mocks.versions.mockResolvedValue([{ id: "section", version: 3 }]);
  await expect(persistVerifiedCharacters(session, "book", sources, candidates())).rejects.toThrow(
    "CHARACTER_SOURCE_CHANGED",
  );
  expect(mocks.stale).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("una tarea incremental sustituida no pisa la revisión completa", async () => {
  mocks.active.mockResolvedValue(null);
  await expect(
    persistVerifiedCharacters(session, "book", sources, candidates(), "old-task"),
  ).rejects.toThrow("CHARACTER_TASK_SUPERSEDED");
  expect(mocks.upsert).not.toHaveBeenCalled();
});
