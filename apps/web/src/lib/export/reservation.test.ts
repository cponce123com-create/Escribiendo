import { beforeEach, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findJob: vi.fn(),
  updateJob: vi.fn(),
  generate: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: { exportJob: { findFirst: mocks.findJob, update: mocks.updateJob } },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/export/generate", () => ({ generateFile: mocks.generate, exportContext: vi.fn() }));
vi.mock("@/lib/export/reproduce", () => ({ resolveExportJobInput: mocks.resolve }));
vi.mock("@/lib/export/signature", () => ({ verifyDownload: () => true }));

import { processExportJob } from "./jobs";
import { GET } from "@/app/api/exports/[jobId]/download/route";
import { hayExportacionEnCurso } from "./slot";

const session = {
  user: { id: "u" },
  workspace: { id: "w", role: "OWNER" },
} as unknown as SessionContext;
const job = {
  id: "j",
  bookId: "b",
  status: "COMPLETED",
  format: "PDF_DIGITAL",
  manuscriptHash: "hash",
  progress: 100,
  errorMessage: null,
  resultMetadata: {},
  createdAt: new Date("2026-10-29Z"),
  completedAt: null,
  sectionVersions: [],
  options: {},
};
const file = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "application/pdf",
  fileName: "libro.pdf",
  metadata: {},
};
function download() {
  return GET(new Request("https://example.test/api/exports/j/download"), {
    params: Promise.resolve({ jobId: "j" }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.findJob.mockResolvedValue(job);
  mocks.updateJob.mockResolvedValue(job);
  mocks.resolve.mockResolvedValue({});
  mocks.generate.mockResolvedValue(file);
});

it.each(["generación", "descarga"])(
  "%s activa bloquea ambos recorridos incluso después de diez minutos y libera al terminar",
  async (entry) => {
    let finish!: (value: typeof file) => void;
    const deferred = new Promise<typeof file>((resolve) => {
      finish = resolve;
    });
    mocks.generate.mockReturnValueOnce(deferred);
    const pending = entry === "generación" ? processExportJob(session, "j") : download();
    try {
      await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
      await expect(processExportJob(session, "otro")).rejects.toThrow("Ya hay una exportación");
      expect((await download()).status).toBe(429);
      expect(mocks.generate).toHaveBeenCalledOnce();
    } finally {
      finish(file);
      await pending;
    }
    expect(hayExportacionEnCurso()).toBe(false);
    expect((await download()).status).toBe(200);
    await expect(processExportJob(session, "j")).resolves.toMatchObject({ id: "j" });
    expect(hayExportacionEnCurso()).toBe(false);
  },
);

it.each(["generación", "descarga"])(
  "%s libera su reserva cuando falla el exportador",
  async (entry) => {
    mocks.generate.mockRejectedValueOnce(new Error("No se pudo componer"));
    if (entry === "generación") {
      await expect(processExportJob(session, "j")).rejects.toThrow("No se pudo componer");
      expect(mocks.updateJob).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    } else {
      expect((await download()).status).toBe(500);
    }
    expect(hayExportacionEnCurso()).toBe(false);
    expect((await download()).status).toBe(200);
  },
);
