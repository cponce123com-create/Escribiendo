import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertRequestOrigin } from "@/lib/security/request-context";
import { analyzeNarrative } from "@/lib/story/character-analysis";
import { filterCharacterCandidates } from "@/lib/story/character-analysis-quality";
import {
  analysisTaskClaimWhere,
  MAX_ANALYSIS_ATTEMPTS,
  ANALYSIS_LEASE_MS,
} from "@/lib/story/analysis-task-policy";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { persistVerifiedCharacters } from "@/lib/story/verified-character-storage";
import { extractPlainText } from "@/lib/story/engine/text";
import { assertCanPerform } from "@/lib/books/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bodySchema = z.object({ taskId: z.string().uuid() });
function hashContent(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex");
}
const NON_NARRATIVE = new Set([
  "TITLE_PAGE",
  "COPYRIGHT",
  "DEDICATION",
  "TABLE_OF_CONTENTS",
  "BIBLIOGRAPHY",
  "GLOSSARY",
  "ABOUT_AUTHOR",
]);
export async function POST(request: Request) {
  try {
    assertRequestOrigin(request);
  } catch {
    return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    assertCanPerform(session.workspace.role, "story:manage");
  } catch {
    return NextResponse.json(
      { error: "No tienes permiso para analizar personajes." },
      { status: 403 },
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  const task = await prisma.characterAnalysisTask.findFirst({
    where: {
      id: parsed.data.taskId,
      workspaceId: session.workspace.id,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: {
      id: true,
      bookId: true,
      sectionId: true,
      contentHash: true,
      status: true,
      attempts: true,
    },
  });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada." }, { status: 404 });
  if (task.status === "COMPLETED" || task.status === "SUPERSEDED")
    return NextResponse.json({ status: task.status, suggestions: 0 });
  const now = new Date();
  if (task.attempts >= MAX_ANALYSIS_ATTEMPTS) {
    // Un último intento en curso conserva su ventana para terminar.
    const exhausted = await prisma.characterAnalysisTask.updateMany({
      where: {
        id: task.id,
        workspaceId: session.workspace.id,
        attempts: { gte: MAX_ANALYSIS_ATTEMPTS },
        OR: [
          { status: { in: ["PENDING", "FAILED"] } },
          { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - ANALYSIS_LEASE_MS) } },
        ],
      },
      data: { status: "FAILED" },
    });
    return NextResponse.json({
      status: exhausted.count > 0 || task.status !== "PROCESSING" ? "FAILED" : "PROCESSING",
      suggestions: 0,
      retryable: false,
    });
  }
  const claimed = await prisma.characterAnalysisTask.updateMany({
    where: {
      AND: analysisTaskClaimWhere(task.id, session.workspace.id, now),
      attempts: task.attempts,
    },
    data: { status: "PROCESSING", attempts: { increment: 1 }, updatedAt: now },
  });
  if (!claimed.count) return NextResponse.json({ status: "PROCESSING", suggestions: 0 });
  const attempt = task.attempts + 1;
  const finishTask = async (status: "COMPLETED" | "SUPERSEDED") => {
    const result = await prisma.characterAnalysisTask.updateMany({
      where: {
        id: task.id,
        workspaceId: session.workspace.id,
        status: "PROCESSING",
        attempts: attempt,
      },
      data: { status, completedAt: new Date() },
    });
    if (!result.count) throw new Error("CHARACTER_TASK_SUPERSEDED");
  };
  try {
    const section = await prisma.bookSection.findFirst({
      where: { id: task.sectionId, bookId: task.bookId, deletedAt: null },
      select: { id: true, title: true, type: true, content: true, version: true },
    });
    if (!section) {
      await finishTask("SUPERSEDED");
      return NextResponse.json({ status: "SUPERSEDED", suggestions: 0 });
    }
    const currentHash = hashContent(section.content);
    if (currentHash !== task.contentHash) {
      await finishTask("SUPERSEDED");
      return NextResponse.json({ status: "SUPERSEDED", suggestions: 0 });
    }
    if (NON_NARRATIVE.has(section.type)) {
      await finishTask("COMPLETED");
      return NextResponse.json({ status: "COMPLETED", suggestions: 0 });
    }
    const [book, existing] = await Promise.all([
      prisma.book.findFirst({
        where: { id: task.bookId, workspaceId: session.workspace.id, deletedAt: null },
        select: { title: true },
      }),
      prisma.storyCharacter.findMany({
        where: { workspaceId: session.workspace.id, bookId: task.bookId, deletedAt: null },
        select: { name: true },
      }),
    ]);
    if (!book) {
      await finishTask("SUPERSEDED");
      return NextResponse.json({ error: "Libro no disponible." }, { status: 404 });
    }
    const text = extractPlainText(JSON.stringify(section.content));
    const candidates = analyzeNarrative([{ id: section.id, title: section.title, text }]);
    const filtered = filterCharacterCandidates(candidates, {
      bookTitle: book.title,
      existingCharacterNames: existing.map((item) => item.name),
      sectionText: text,
    });
    const created = await persistVerifiedCharacters(
      session,
      task.bookId,
      [{ id: section.id, contentHash: currentHash, version: section.version }],
      filtered,
      task.id,
      attempt,
    );
    await finishTask("COMPLETED");
    return NextResponse.json({ status: "COMPLETED", suggestions: created });
  } catch (error) {
    if (error instanceof Error && error.message === "CHARACTER_TASK_SUPERSEDED")
      return NextResponse.json({ status: "SUPERSEDED", suggestions: 0 });
    await prisma.characterAnalysisTask
      .updateMany({
        where: {
          id: task.id,
          status: "PROCESSING",
          workspaceId: session.workspace.id,
          attempts: attempt,
        },
        data: { status: "FAILED" },
      })
      .catch(() => undefined);
    logger.error("character-analysis.process-failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      {
        error:
          attempt >= MAX_ANALYSIS_ATTEMPTS
            ? "El análisis agotó sus intentos. Revisa el contenido antes de volver a analizar."
            : "No se pudo analizar el contenido; la tarea queda pendiente de reintento.",
        retryable: attempt < MAX_ANALYSIS_ATTEMPTS,
      },
      { status: 500 },
    );
  }
}
