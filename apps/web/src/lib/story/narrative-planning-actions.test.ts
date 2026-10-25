import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  book: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  section: vi.fn(),
  character: vi.fn(),
  event: vi.fn(),
  events: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./action-helpers", () => ({ beginStoryAction: mocks.start }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        book: { findFirst: mocks.book, updateMany: mocks.claim, update: mocks.update },
        bookSection: { updateMany: mocks.section, findFirst: mocks.section },
        storyCharacter: { findFirst: mocks.character },
        storyCharacterEvent: {
          updateMany: mocks.event,
          create: mocks.event,
          findMany: mocks.events,
          aggregate: async () => ({ _max: { sequence: 3 } }),
        },
      }),
  },
}));
import { updateNarrativePlanningAction } from "./narrative-planning-actions";
const bookId = "11111111-1111-4111-8111-111111111111",
  characterId = "22222222-2222-4222-8222-222222222222";
const data = (extra: Record<string, string>) => {
  const fd = new FormData();
  Object.entries({ bookId, version: "0", ...extra }).forEach(([k, v]) => fd.set(k, v));
  return fd;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockResolvedValue({
    ok: true,
    session: { user: { id: "user" }, workspace: { id: "workspace", role: "AUTHOR" } },
    context: {},
  });
  mocks.book.mockResolvedValue({ narrativeStructure: "THREE_ACTS" });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.section.mockResolvedValue({ count: 1 });
  mocks.character.mockResolvedValue({ id: characterId });
  mocks.event.mockResolvedValue({ count: 1 });
});
it("rechaza períodos imposibles antes de escribir", async () => {
  const result = await updateNarrativePlanningAction(
    { status: "idle" },
    data({
      operation: "event",
      title: "Nacimiento",
      characterId,
      startsOn: "2020-02-31",
      datePrecision: "EXACT",
    }),
  );
  expect(result.status).toBe("error");
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("no reemplaza una planificación concurrente", async () => {
  mocks.claim.mockResolvedValue({ count: 0 });
  const result = await updateNarrativePlanningAction(
    { status: "idle" },
    data({ operation: "structure", structure: "FIVE_ACTS" }),
  );
  expect(result.message).toContain("otra pestaña");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("no asigna etapas de un modelo distinto", async () => {
  expect(
    (
      await updateNarrativePlanningAction(
        { status: "idle" },
        data({ operation: "stage", id: characterId, stage: "Ordalía" }),
      )
    ).status,
  ).toBe("error");
  expect(mocks.section).not.toHaveBeenCalled();
});
it("un acontecimiento exige un personaje del mismo libro y workspace", async () => {
  mocks.character.mockResolvedValue(null);
  expect(
    (
      await updateNarrativePlanningAction(
        { status: "idle" },
        data({ operation: "event", title: "Viaje", characterId }),
      )
    ).status,
  ).toBe("error");
  expect(mocks.character).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: characterId, bookId, workspaceId: "workspace", deletedAt: null },
    }),
  );
  expect(mocks.event).not.toHaveBeenCalled();
});
