import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertRequestOrigin } from "@/lib/security/request-context";
import { analyzeNarrative } from "@/lib/story/character-analysis";
import {
  filterCharacterCandidates,
  normalizeCharacterName,
} from "@/lib/story/character-analysis-quality";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bodySchema = z.object({ taskId: z.string().uuid() });
function flatten(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown[] };
  return [
    typeof node.text === "string" ? node.text : "",
    Array.isArray(node.content) ? node.content.map(flatten).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ");
}
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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  const task = await prisma.characterAnalysisTask.findFirst({
    where: { id: parsed.data.taskId, workspaceId: session.workspace.id },
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
      select: { id: true, title: true, type: true, content: true },
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
    await prisma.storyCharacterSuggestion.updateMany({
      where: {
        sectionId: section.id,
        contentHash: { not: currentHash },
        status: "PENDING",
        stale: false,
      },
      data: { stale: true },
    });
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
    const text = flatten(section.content);
    const candidates = analyzeNarrative([{ title: section.title, text }]);
    const filtered = filterCharacterCandidates(candidates, {
      bookTitle: book.title,
      existingCharacterNames: existing.map((item) => item.name),
      sectionText: text,
    });
    let created = 0;
    for (const candidate of filtered) {
      const evidence = candidate.evidence[0];
      if (!evidence?.excerpt) continue;
      await prisma.storyCharacterSuggestion.upsert({
        where: {
          bookId_normalizedName: {
            bookId: task.bookId,
            normalizedName: normalizeCharacterName(candidate.name).slice(0, 160),
          },
        },
        create: {
          workspaceId: session.workspace.id,
          bookId: task.bookId,
          sectionId: section.id,
          contentHash: currentHash,
          normalizedName: normalizeCharacterName(candidate.name).slice(0, 160),
          suggestedName: candidate.name.slice(0, 160),
          suggestedAge: candidate.age ?? null,
          suggestedDescription: candidate.description ?? null,
          excerpt: evidence.excerpt,
          confidence: candidate.confidence,
          mentions: candidate.mentions,
        },
        update: {
          sectionId: section.id,
          contentHash: currentHash,
          suggestedName: candidate.name.slice(0, 160),
          suggestedAge: candidate.age ?? null,
          suggestedDescription: candidate.description ?? null,
          excerpt: evidence.excerpt,
          confidence: candidate.confidence,
          mentions: candidate.mentions,
          stale: false,
        },
      });
      created++;
    }
    await prisma.characterAnalysisTask.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return NextResponse.json({ status: "COMPLETED", suggestions: created });
  } catch (error) {
    await prisma.characterAnalysisTask
      .update({ where: { id: task.id }, data: { status: "FAILED" } })
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
