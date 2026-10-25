import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertRequestOrigin } from "@/lib/security/request-context";
import { analyzeNarrative } from "@/lib/story/character-analysis";
import { filterCharacterCandidates } from "@/lib/story/character-analysis-quality";
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
    select: { id: true, bookId: true, sectionId: true, contentHash: true, status: true },
  });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada." }, { status: 404 });
  if (task.status === "COMPLETED" || task.status === "SUPERSEDED")
    return NextResponse.json({ status: task.status, suggestions: 0 });
  const claimed = await prisma.characterAnalysisTask.updateMany({
    where: { id: task.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
  if (!claimed.count) return NextResponse.json({ status: "PROCESSING", suggestions: 0 });
  try {
    const section = await prisma.bookSection.findFirst({
      where: { id: task.sectionId, bookId: task.bookId, deletedAt: null },
      select: { id: true, title: true, type: true, content: true, version: true },
    });
    if (!section) {
      await prisma.characterAnalysisTask.update({
        where: { id: task.id },
        data: { status: "SUPERSEDED", completedAt: new Date() },
      });
      return NextResponse.json({ status: "SUPERSEDED", suggestions: 0 });
    }
    const currentHash = hashContent(section.content);
    if (currentHash !== task.contentHash) {
      await prisma.characterAnalysisTask.update({
        where: { id: task.id },
        data: { status: "SUPERSEDED", completedAt: new Date() },
      });
      return NextResponse.json({ status: "SUPERSEDED", suggestions: 0 });
    }
    if (NON_NARRATIVE.has(section.type)) {
      await prisma.characterAnalysisTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
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
    if (!book) return NextResponse.json({ error: "Libro no disponible." }, { status: 404 });
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
    );
    await prisma.characterAnalysisTask.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return NextResponse.json({ status: "COMPLETED", suggestions: created });
  } catch (error) {
    if (error instanceof Error && error.message === "CHARACTER_TASK_SUPERSEDED")
      return NextResponse.json({ status: "SUPERSEDED", suggestions: 0 });
    await prisma.characterAnalysisTask
      .updateMany({
        where: { id: task.id, status: "PROCESSING", workspaceId: session.workspace.id },
        data: { status: "FAILED" },
      })
      .catch(() => undefined);
    console.error(
      "character-analysis.process-failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "No se pudo analizar el contenido; la tarea queda pendiente de reintento." },
      { status: 500 },
    );
  }
}
