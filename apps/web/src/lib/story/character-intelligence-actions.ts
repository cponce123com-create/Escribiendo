"use server";
import { MAX_ANALYSIS_ATTEMPTS } from "./analysis-task-policy";
import { personalIdentity, readNameVerification } from "./personal-name";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { beginStoryAction, logStoryError, storyBookExists } from "./action-helpers";
import { storyIdSchema } from "./validation";
import { formValue, errorState, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import { writeAuditLog } from "@/lib/auth/audit";
import { characterAnalysisError } from "./character-analysis-errors";
import { buildAppearanceTimeline, detectAppearanceAlerts } from "./appearance-timeline";
// El aplanado vive en un módulo compartido; se conserva el nombre local para
// no tocar las llamadas repartidas por este archivo.
import { tipTapToPlainText as plain } from "./tiptap-text";
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
function flexibleTerm(name: string): string {
  const groups: Record<string, string> = {
    a: "aáàâäã",
    e: "eéèêë",
    i: "iíìîï",
    o: "oóòôöõ",
    u: "uúùûü",
    n: "nñ",
  };
  return [...name]
    .map((char) => {
      if (/\s/u.test(char)) return "\\s+";
      const base = char
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es");
      const choices = groups[base];
      return choices
        ? `[${choices}${choices.toUpperCase()}]`
        : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
}
export async function getCharacterIntelligence(bookId: string, characterId: string) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Inicia sesión para continuar." };
  if (!(await storyBookExists(session, bookId)))
    return { ok: false as const, error: "Libro no disponible." };
  const character = await prisma.storyCharacter.findFirst({
    where: { id: characterId, bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, name: true, age: true },
  });
  if (!character) return { ok: false as const, error: "Personaje no encontrado en este libro." };
  const sections = await prisma.bookSection.findMany({
    where: { bookId, deletedAt: null, isHidden: false },
    orderBy: [{ sortOrder: "asc" }],
    select: { id: true, title: true, type: true, content: true },
  });
  const needle = norm(character.name);
  const appearances = [] as {
    sectionId: string;
    title: string;
    excerpt: string;
    count: number;
    dialogues: string[];
  }[];
  const ageValues = new Map<string, { section: string; excerpt: string }>();
  const eyeValues = new Map<string, { section: string; excerpt: string }>();
  let death: { section: string; index: number; excerpt: string } | null = null;
  let returnAfter: { section: string; index: number; excerpt: string } | null = null;
  const events = [] as { sectionId: string; section: string; title: string; excerpt: string }[];
  for (const section of sections) {
    const text = plain(section.content);
    const searchPattern = new RegExp(
      `(?<![\\p{L}])${flexibleTerm(character.name)}(?![\\p{L}])`,
      "giu",
    );
    let count = 0;
    const excerpts: string[] = [];
    for (const match of text.matchAll(searchPattern)) {
      const index = match.index ?? 0;
      const matchLength = match[0].length;
      const excerpt = text
        .slice(Math.max(0, index - 110), Math.min(text.length, index + matchLength + 140))
        .replace(/\s+/g, " ")
        .trim();
      if (excerpts.length < 5) excerpts.push(excerpt);
      count++;
    }
    if (count) {
      const dialogues = [...text.matchAll(/[«“"]([^»”"]{4,260})[»”"]/g)]
        .map((m) => m[1] ?? "")
        .filter((q) =>
          norm(
            text.slice(
              Math.max(0, (text.indexOf(q) || 0) - 100),
              (text.indexOf(q) || 0) + q.length + 100,
            ),
          ).includes(needle),
        )
        .slice(0, 5);
      appearances.push({
        sectionId: section.id,
        title: section.title,
        excerpt: excerpts[0] ?? "",
        count,
        dialogues,
      });
      for (const sentence of text.split(/(?<=[.!?])\s+/).filter((s) => norm(s).includes(needle))) {
        const ageRe = /(?:a sus|tenía|de)\s+(\d{1,3})\s+años/gi;
        let m: RegExpExecArray | null;
        while ((m = ageRe.exec(sentence))) {
          if (m[1] && Number(m[1]) < 125)
            ageValues.set(m[1], { section: section.title, excerpt: sentence.trim().slice(0, 300) });
        }
        const eyes =
          /(?:ojos|iris)\s+(?:de color\s+)?(?:azules?|verdes?|marrones?|negros?|grises?|avellana|ámbar)/gi;
        while ((m = eyes.exec(sentence)))
          eyeValues.set(norm(m[0]), {
            section: section.title,
            excerpt: sentence.trim().slice(0, 300),
          });
        if (/\b(?:murió|falleció|muerto|muerta|asesinado|asesinada)\b/i.test(sentence))
          death = {
            section: section.title,
            index: sections.indexOf(section),
            excerpt: sentence.slice(0, 260),
          };
        if (/\b(?:regresó|reapareció|volvió|estaba vivo|estaba viva)\b/i.test(sentence))
          returnAfter = {
            section: section.title,
            index: sections.indexOf(section),
            excerpt: sentence.slice(0, 260),
          };
        if (
          /\b(?:decidió|descubrió|confesó|abandonó|salvó|traicionó|perdonó|enfrentó)\b/i.test(
            sentence,
          )
        )
          events.push({
            sectionId: section.id,
            section: section.title,
            title: sentence.trim().slice(0, 100),
            excerpt: sentence.trim().slice(0, 400),
          });
      }
    }
  }
  const alerts = [] as { kind: string; message: string; evidence: string; section: string }[];
  if (ageValues.size > 1)
    alerts.push({
      kind: "age",
      message: `Posible inconsistencia: aparecen edades distintas (${[...ageValues.keys()].join(" y ")}). Revisa saltos temporales, recuerdos o narradores.`,
      evidence: [...ageValues.values()].map((x) => x.excerpt).join(" · "),
      section: [...ageValues.values()].map((x) => x.section).join(" / "),
    });
  if (eyeValues.size > 1)
    alerts.push({
      kind: "description",
      message:
        "Posible inconsistencia en el color de ojos. Podría tratarse de una descripción figurada, recuerdo o cambio deliberado.",
      evidence: [...eyeValues.values()].map((x) => x.excerpt).join(" · "),
      section: [...eyeValues.values()].map((x) => x.section).join(" / "),
    });
  if (death && returnAfter && returnAfter.index > death.index)
    alerts.push({
      kind: "continuity",
      message:
        "Posible continuidad a revisar: hay una mención de muerte y una reaparición posterior. Considera flashbacks, falsa muerte o narrador no fiable.",
      evidence: `${death.excerpt} · ${returnAfter.excerpt}`,
      section: `${death.section} / ${returnAfter.section}`,
    });
  const timeline = buildAppearanceTimeline(
    sections.map((section, index) => ({ id: section.id, title: section.title, order: index + 1 })),
    appearances.map((appearance) => ({
      sectionId: appearance.sectionId,
      count: appearance.count,
    })),
  );
  const arcAlerts = detectAppearanceAlerts(character.name, timeline);
  const [relations, storedEvents, characters] = await Promise.all([
    prisma.storyCharacterRelation.findMany({
      where: {
        workspaceId: session.workspace.id,
        bookId,
        OR: [{ sourceCharacterId: characterId }, { targetCharacterId: characterId }],
      },
      include: {
        source: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.storyCharacterEvent.findMany({
      where: { workspaceId: session.workspace.id, bookId, characterId },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        details: true,
        sourceExcerpt: true,
        sectionId: true,
        sequence: true,
        suggested: true,
      },
    }),
    prisma.storyCharacter.findMany({
      where: {
        workspaceId: session.workspace.id,
        bookId,
        deletedAt: null,
        id: { not: characterId },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return {
    ok: true as const,
    character,
    appearances,
    alerts,
    arcAlerts,
    timeline,
    events,
    storedEvents,
    relations,
    characters,
  };
}
export async function saveCharacterRelation(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  const bookId = formValue(fd, "bookId"),
    sourceId = formValue(fd, "sourceCharacterId"),
    targetId = formValue(fd, "targetCharacterId"),
    kind = formValue(fd, "kind");
  if (!(await storyBookExists(start.session, bookId))) return errorState("Libro no válido.");
  if (sourceId === targetId) return errorState("Elige dos personajes distintos.");
  const allowed = ["FAMILY", "FRIENDSHIP", "ROMANCE", "RIVALRY", "CONFLICT", "ALLIANCE", "OTHER"];
  if (!allowed.includes(kind)) return errorState("Tipo de relación no válido.");
  const ids = await prisma.storyCharacter.findMany({
    where: {
      id: { in: [sourceId, targetId] },
      workspaceId: start.session.workspace.id,
      bookId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (ids.length !== 2) return errorState("Ambos personajes deben pertenecer a este libro.");
  try {
    const relation = await prisma.storyCharacterRelation.upsert({
      where: {
        sourceCharacterId_targetCharacterId_kind: {
          sourceCharacterId: sourceId,
          targetCharacterId: targetId,
          kind: kind as "FAMILY",
        },
      },
      create: {
        workspaceId: start.session.workspace.id,
        bookId,
        sourceCharacterId: sourceId,
        targetCharacterId: targetId,
        kind: kind as never,
        description: formValue(fd, "description").slice(0, 300) || null,
      },
      update: { description: formValue(fd, "description").slice(0, 300) || null },
    });
    await writeAuditLog(
      {
        action: "STORY_CHARACTER_RELATION_SAVED",
        entityType: "StoryCharacterRelation",
        entityId: relation.id,
        workspaceId: start.session.workspace.id,
        actorId: start.session.user.id,
        metadata: { bookId, kind },
      },
      start.context,
    );
  } catch (e) {
    logStoryError("story.character_relation_error", start.context, e);
    return errorState("No se pudo guardar la relación.");
  }
  revalidatePath("/characters");
  return successState("Relación guardada.");
}
export async function deleteCharacterRelation(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  const id = storyIdSchema.safeParse(formValue(fd, "relationId"));
  if (!id.success) return errorState("Relación no válida.");
  const r = await prisma.storyCharacterRelation.findFirst({
    where: { id: id.data, workspaceId: start.session.workspace.id },
    select: { id: true, bookId: true },
  });
  if (!r) return errorState("Relación no encontrada.");
  await prisma.storyCharacterRelation.delete({ where: { id: r.id } });
  revalidatePath("/characters");
  return successState("Relación eliminada.");
}
export async function saveCharacterEvent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  const bookId = formValue(fd, "bookId"),
    characterId = formValue(fd, "characterId"),
    sectionId = formValue(fd, "sectionId") || null,
    title = formValue(fd, "title").trim();
  if (!(await storyBookExists(start.session, bookId))) return errorState("Libro no válido.");
  if (!title || title.length > 200)
    return errorState("El título debe tener entre 1 y 200 caracteres.");
  const character = await prisma.storyCharacter.findFirst({
    where: { id: characterId, bookId, workspaceId: start.session.workspace.id, deletedAt: null },
    select: { id: true },
  });
  if (!character) return errorState("Personaje no encontrado en este libro.");
  if (sectionId) {
    const section = await prisma.bookSection.findFirst({
      where: { id: sectionId, bookId, deletedAt: null },
      select: { id: true },
    });
    if (!section) return errorState("La sección no pertenece al libro.");
  }
  try {
    await prisma.storyCharacterEvent.create({
      data: {
        workspaceId: start.session.workspace.id,
        bookId,
        characterId,
        sectionId,
        title,
        details: formValue(fd, "details").slice(0, 5000) || null,
        sourceExcerpt: formValue(fd, "sourceExcerpt").slice(0, 2000) || null,
        sequence: Math.max(
          0,
          Math.min(9999, Number.parseInt(formValue(fd, "sequence") || "0", 10) || 0),
        ),
        suggested: formValue(fd, "suggested") === "true",
      },
    });
  } catch (e) {
    logStoryError("story.character_event_error", start.context, e);
    return errorState("No se pudo guardar el acontecimiento.");
  }
  revalidatePath("/characters");
  return successState("Acontecimiento añadido a la evolución.");
}
export async function deleteCharacterEvent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  const id = storyIdSchema.safeParse(formValue(fd, "eventId"));
  if (!id.success) return errorState("Acontecimiento no válido.");
  const item = await prisma.storyCharacterEvent.findFirst({
    where: { id: id.data, workspaceId: start.session.workspace.id },
    select: { id: true },
  });
  if (!item) return errorState("Acontecimiento no encontrado.");
  await prisma.storyCharacterEvent.delete({ where: { id: item.id } });
  revalidatePath("/characters");
  return successState("Acontecimiento eliminado.");
}

export async function getCharacterSuggestions(bookId: string) {
  try {
    const session = await getSession();
    if (!session) return { ok: false as const, error: "Inicia sesión para continuar." };
    if (!(await storyBookExists(session, bookId)))
      return { ok: false as const, error: "Libro no disponible." };
    await prisma.characterAnalysisTask.updateMany({
      where: {
        workspaceId: session.workspace.id,
        bookId,
        status: "PROCESSING",
        attempts: { gte: MAX_ANALYSIS_ATTEMPTS },
        updatedAt: { lt: new Date(Date.now() - 10 * 60_000) },
      },
      data: { status: "FAILED" },
    });
    await prisma.characterAnalysisTask.updateMany({
      where: {
        workspaceId: session.workspace.id,
        bookId,
        status: "PROCESSING",
        attempts: { lt: MAX_ANALYSIS_ATTEMPTS },
        updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
      data: { status: "PENDING" },
    });
    const [suggestions, tasks, pendingTasks] = await Promise.all([
      prisma.storyCharacterSuggestion.findMany({
        where: {
          workspaceId: session.workspace.id,
          bookId,
          status: "PENDING",
        },
        include: { section: { select: { title: true } } },
        orderBy: [{ stale: "asc" }, { confidence: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.characterAnalysisTask.groupBy({
        by: ["status"],
        where: { workspaceId: session.workspace.id, bookId },
        _count: { _all: true },
      }),
      prisma.characterAnalysisTask.findMany({
        where: {
          workspaceId: session.workspace.id,
          bookId,
          status: "PENDING",
          attempts: { lt: MAX_ANALYSIS_ATTEMPTS },
        },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true },
      }),
    ]);
    return {
      ok: true as const,
      suggestions,
      pendingTaskIds: pendingTasks.map((task) => task.id),
      tasks: Object.fromEntries(tasks.map((task) => [task.status, task._count._all])),
    };
  } catch (error) {
    console.error(
      "story.character_suggestions_load_error",
      error instanceof Error ? error.name : "UnknownError",
    );
    return { ok: false as const, error: characterAnalysisError(error) };
  }
}

export async function queueBookCharacterAnalysis(bookId: string) {
  try {
    const start = await beginStoryAction();
    if (!start.ok) return { ok: false as const, error: start.state.message ?? "Permiso denegado." };
    if (!(await storyBookExists(start.session, bookId)))
      return { ok: false as const, error: "Libro no disponible." };
    const sections = await prisma.bookSection.findMany({
      where: { bookId, deletedAt: null, isHidden: false },
      select: { id: true, type: true, content: true },
    });
    const taskIds: string[] = [];
    for (const section of sections) {
      const contentHash = createHash("sha256")
        .update(JSON.stringify(section.content), "utf8")
        .digest("hex");
      const task = await prisma.characterAnalysisTask.upsert({
        where: { sectionId_contentHash: { sectionId: section.id, contentHash } },
        create: {
          workspaceId: start.session.workspace.id,
          bookId,
          sectionId: section.id,
          contentHash,
        },
        update: { status: "PENDING", completedAt: null },
        select: { id: true },
      });
      taskIds.push(task.id);
    }
    await writeAuditLog(
      {
        action: "STORY_CHARACTER_ANALYSIS_QUEUED",
        entityType: "Book",
        entityId: bookId,
        workspaceId: start.session.workspace.id,
        actorId: start.session.user.id,
        metadata: { sections: taskIds.length },
      },
      start.context,
    );
    return { ok: true as const, taskIds, count: taskIds.length };
  } catch (error) {
    console.error(
      "story.character_analysis_queue_error",
      error instanceof Error ? error.name : "UnknownError",
    );
    return { ok: false as const, error: characterAnalysisError(error) };
  }
}

export async function reviewCharacterSuggestion(
  _previous: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  const id = storyIdSchema.safeParse(formValue(fd, "suggestionId"));
  const decision = formValue(fd, "decision");
  if (!id.success || !["accept", "discard", "merge"].includes(decision))
    return errorState("La decisión no es válida.");
  const suggestion = await prisma.storyCharacterSuggestion.findFirst({
    where: { id: id.data, workspaceId: start.session.workspace.id, status: "PENDING" },
  });
  if (!suggestion) return errorState("La sugerencia ya se revisó o no está disponible.");
  if (decision === "discard") {
    await prisma.storyCharacterSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "DISCARDED" },
    });
    await writeAuditLog(
      {
        action: "STORY_CHARACTER_SUGGESTION_DISCARDED",
        entityType: "StoryCharacterSuggestion",
        entityId: suggestion.id,
        workspaceId: start.session.workspace.id,
        actorId: start.session.user.id,
        metadata: { bookId: suggestion.bookId, stale: suggestion.stale },
      },
      start.context,
    );
    revalidatePath("/characters");
    return successState("Sugerencia descartada; la ficha del personaje no se modificó.");
  }
  if (suggestion.stale || !readNameVerification(suggestion.nameVerification))
    return errorState("Vuelve a analizar la sugerencia antes de aceptarla o fusionarla.");
  if (!(await storyBookExists(start.session, suggestion.bookId)))
    return errorState("Libro no disponible.");
  const source = await prisma.bookSection.findFirst({
    where: {
      id: suggestion.sectionId,
      bookId: suggestion.bookId,
      deletedAt: null,
      book: { workspaceId: start.session.workspace.id, deletedAt: null },
    },
    select: { content: true },
  });
  if (
    !source ||
    createHash("sha256").update(JSON.stringify(source.content)).digest("hex") !==
      suggestion.contentHash
  )
    return errorState("El texto cambió después de la verificación. Vuelve a analizarlo.");
  let characterId = formValue(fd, "characterId");
  let target = null as {
    id: string;
    age: string | null;
    description: string | null;
    notes: string | null;
  } | null;
  if (decision === "merge") {
    const parsedTarget = storyIdSchema.safeParse(characterId);
    if (!parsedTarget.success) return errorState("Elige una ficha de personaje para fusionar.");
    target = await prisma.storyCharacter.findFirst({
      where: {
        id: parsedTarget.data,
        workspaceId: start.session.workspace.id,
        bookId: suggestion.bookId,
        deletedAt: null,
      },
      select: { id: true, age: true, description: true, notes: true },
    });
    if (!target) return errorState("La ficha elegida no pertenece a este libro.");
  } else {
    const existing = await prisma.storyCharacter.findMany({
      where: {
        workspaceId: start.session.workspace.id,
        bookId: suggestion.bookId,
        deletedAt: null,
      },
      select: { id: true, name: true, age: true, description: true, notes: true },
    });
    if (
      existing.some(
        (item) => personalIdentity(item.name) === personalIdentity(suggestion.suggestedName),
      )
    )
      return errorState(
        "Ya existe una ficha con ese nombre. Elige Fusionar para unirla explícitamente.",
      );
  }
  const resolved = await prisma
    .$transaction(async (tx) => {
      const claimed = await tx.storyCharacterSuggestion.updateMany({
        where: { id: suggestion.id, workspaceId: start.session.workspace.id, status: "PENDING" },
        data: { status: decision === "merge" ? "MERGED" : "ACCEPTED" },
      });
      if (claimed.count !== 1) throw new Error("CHARACTER_ALREADY_REVIEWED");
      if (!target && decision === "accept") {
        const created = await tx.storyCharacter.create({
          data: {
            workspaceId: start.session.workspace.id,
            bookId: suggestion.bookId,
            createdById: start.session.user.id,
            name: suggestion.suggestedName,
            role: "OTHER",
            age: suggestion.suggestedAge,
            description: suggestion.suggestedDescription,
          },
          select: { id: true },
        });
        characterId = created.id;
      } else if (target) {
        // Solo completa campos vacíos; no pisa ninguna modificación escrita por el autor.
        await tx.storyCharacter.update({
          where: { id: target.id },
          data: {
            ...(target.age === null && suggestion.suggestedAge
              ? { age: suggestion.suggestedAge }
              : {}),
            ...(target.description === null && suggestion.suggestedDescription
              ? { description: suggestion.suggestedDescription }
              : {}),
          },
        });
        characterId = target.id;
      }
      await tx.storyCharacterSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: target || decision === "merge" ? "MERGED" : "ACCEPTED",
          characterId: characterId || null,
        },
      });
      return characterId;
    })
    .catch(() => null);
  if (!resolved)
    return errorState("No se pudo aceptar la sugerencia; quizá ya fue revisada. Recarga la lista.");
  await writeAuditLog(
    {
      action:
        decision === "merge" || target
          ? "STORY_CHARACTER_SUGGESTION_MERGED"
          : "STORY_CHARACTER_SUGGESTION_ACCEPTED",
      entityType: "StoryCharacterSuggestion",
      entityId: suggestion.id,
      workspaceId: start.session.workspace.id,
      actorId: start.session.user.id,
      metadata: {
        bookId: suggestion.bookId,
        characterId: resolved ?? null,
        stale: suggestion.stale,
      },
    },
    start.context,
  );
  revalidatePath("/characters");
  return successState(
    resolved
      ? decision === "merge" || target
        ? "Sugerencia fusionada sin reemplazar datos existentes."
        : "Personaje añadido desde la sugerencia."
      : "Sugerencia procesada.",
  );
}
