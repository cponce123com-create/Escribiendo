"use client";
import { useActionState, useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextareaField } from "@/components/forms/textarea-field";
import { Dialog } from "@/components/forms/dialog";
import type { ActionState } from "@/lib/action-state";
import { MASTER_FIELDS, CHAPTER_FIELDS, masterChanged } from "@/lib/story/writing/brief";
import type { WritingPlanningData } from "@/lib/story/writing/queries";
import { saveWritingBriefAction, getWritingGuideAction } from "@/lib/story/writing/actions";

type Section = WritingPlanningData["sections"][number];
function BriefForm({
  data,
  section,
  canManage,
  onDirty,
  saveDisabled = false,
}: {
  data: WritingPlanningData;
  section?: Section;
  canManage: boolean;
  onDirty?: () => void;
  saveDisabled?: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveWritingBriefAction, {
    status: "idle",
  });
  const revision = section ? section.brief : data.master;
  const fields = section ? CHAPTER_FIELDS : MASTER_FIELDS;
  const content = revision?.content as Record<string, unknown> | undefined;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.keys(fields).map((key) => [
        key,
        typeof content?.[key] === "string" ? (content[key] as string) : "",
      ]),
    ),
  );
  const [characterIds, setCharacterIds] = useState<string[]>(
    Array.isArray(content?.characterIds) ? (content.characterIds as string[]) : [],
  );
  const [worldIds, setWorldIds] = useState<string[]>(
    Array.isArray(content?.worldIds) ? (content.worldIds as string[]) : [],
  );
  return (
    <form action={action} onChange={onDirty} className="space-y-4">
      <p className="text-sm text-ink-soft">
        {revision
          ? `Revisión ${revision.version} · ${revision.status === "APPROVED" ? "Aprobada" : "Borrador"}`
          : "Sin ficha guardada."}
      </p>
      <input type="hidden" name="bookId" value={data.book.id} />
      <input type="hidden" name="sectionId" value={section?.id ?? ""} />
      <input type="hidden" name="version" value={revision?.version ?? 0} />
      <input type="hidden" name="masterVersion" value={data.master?.version ?? 0} />
      <input type="hidden" name="sourceVersion" value={section?.version ?? 0} />
      <input type="hidden" name="sourceKey" value={data.sourceKey} />
      <fieldset disabled={!canManage} className="space-y-4">
        {Object.entries(fields).map(([key, label]) => (
          <TextareaField
            key={key}
            name={key}
            label={label}
            idPrefix={section?.id ?? "writing-master"}
            value={values[key] ?? ""}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, [key]: event.target.value }))
            }
            rows={key === "scenes" || key === "rules" ? 5 : 2}
            hint={
              key === "writtenSummary"
                ? "Escribe aquí lo que realmente ocurrió. Se vincula a la versión actual del manuscrito; si esta cambia, el resumen dejará de usarse hasta que lo revises."
                : key === "premise"
                  ? "Incluye la situación de partida. Reserva las revelaciones futuras para las restricciones del capítulo correspondiente."
                  : undefined
            }
          />
        ))}
        {section ? (
          <>
            <label className="field-label" htmlFor="writing-characters">
              Personajes del capítulo
            </label>
            <select
              id="writing-characters"
              className="field-input"
              name="characterIds"
              multiple
              size={Math.min(5, Math.max(2, data.characters.length))}
              value={characterIds}
              onChange={(event) =>
                setCharacterIds(Array.from(event.target.selectedOptions, (option) => option.value))
              }
            >
              {data.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="writing-worlds">
              Lugares y elementos del capítulo
            </label>
            <select
              id="writing-worlds"
              className="field-input"
              name="worldIds"
              multiple
              size={Math.min(5, Math.max(2, data.worlds.length))}
              value={worldIds}
              onChange={(event) =>
                setWorldIds(Array.from(event.target.selectedOptions, (option) => option.value))
              }
            >
              {data.worlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Las fichas seleccionadas se copian al aprobar la guía. Revisa la guía si después
              cambias sus datos. Puedes seleccionar varias opciones con Control o Comando.
            </p>
          </>
        ) : null}
        {canManage ? (
          <>
            <label
              className="field-label"
              htmlFor={section ? "writing-chapter-status" : "writing-master-status"}
            >
              Guardar como
            </label>
            <select
              className="field-input"
              id={section ? "writing-chapter-status" : "writing-master-status"}
              name="status"
              defaultValue="DRAFT"
            >
              <option value="DRAFT">Borrador para revisar</option>
              <option value="APPROVED">Aprobar esta revisión</option>
            </select>
            <SubmitButton
              label={section ? "Guardar guía del capítulo" : "Guardar ficha maestra"}
              pendingLabel="Guardando revisión…"
              disabled={saveDisabled}
            />
          </>
        ) : null}
      </fieldset>
      <FormMessage state={state} />
    </form>
  );
}

export function WritingPlanning({
  data,
  canManage,
}: {
  data: WritingPlanningData;
  canManage: boolean;
}) {
  const [sectionId, setSectionId] = useState(
    data.sections.find((s) => s.type === "CHAPTER")?.id ?? data.sections[0]?.id ?? "",
  );
  const section = data.sections.find((s) => s.id === sectionId);
  const [dirtyKey, setDirtyKey] = useState<string | null>(null);
  const [masterDirtyVersion, setMasterDirtyVersion] = useState<number | null>(null);
  const masterVersion = data.master?.version ?? 0;
  const currentKey = `${sectionId}-${section?.brief?.version ?? 0}-${masterVersion}`;
  const dirty = dirtyKey === currentKey;
  const masterDirty = masterDirtyVersion === masterVersion;
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [mode, setMode] = useState<"brief" | "complete">("brief");
  const [preparedGuide, setPreparedGuide] = useState({ key: "", content: "" });
  const guide = preparedGuide.key === currentKey ? preparedGuide.content : "";
  const closeGuide = useCallback(() => setPreparedGuide({ key: "", content: "" }), []);
  const [message, setMessage] = useState<ActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const guideRef = useRef<HTMLTextAreaElement>(null);
  const version = section?.brief?.version;
  const changed = data.master && masterChanged(data.master.content, data.book, data.sections);
  function prepare() {
    if (dirty || masterDirty) {
      setMessage({
        status: "error",
        message: "Guarda y aprueba los cambios de las fichas antes de preparar las instrucciones.",
      });
      return;
    }
    startTransition(async () => {
      try {
        const result = await getWritingGuideAction(data.book.id, sectionId, mode);
        if (result.ok) {
          setPreparedGuide({ key: currentKey, content: result.content });
          setMessage({ status: "idle" });
        } else setMessage({ status: "error", message: result.message });
      } catch {
        setMessage({
          status: "error",
          message:
            "No se pudo conectar para preparar la guía. Conserva tu edición y vuelve a intentarlo.",
        });
      }
    });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(guide);
      setMessage({
        status: "success",
        message: "Instrucciones copiadas. Puedes pegarlas en la IA que utilices.",
      });
    } catch {
      guideRef.current?.focus();
      guideRef.current?.select();
      setMessage({
        status: "error",
        message:
          "No se pudo acceder al portapapeles. El texto está seleccionado para copiarlo manualmente.",
      });
    }
  }
  return (
    <section className="panel space-y-6 p-5" aria-labelledby="writing-planning-title">
      <div>
        <h2 id="writing-planning-title" className="font-serif text-2xl text-ink">
          Guías de escritura para IA
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Conserva las decisiones del libro y prepara instrucciones por capítulo. No se envía tu
          texto a ningún servicio de IA. Cada guardado conserva una revisión anterior.
        </p>
      </div>
      {dirty ? (
        <p className="field-hint" role="status">
          Guarda los cambios del capítulo antes de guardar otra revisión maestra.
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer font-semibold text-ink">Ficha maestra del libro</summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-ink-soft">
            {data.book.title} · {data.book.authorName}. Los títulos y el orden se toman del
            manuscrito; las guías no los modifican.
          </p>
          {changed ? (
            <p className="alert alert-error" role="status">
              La autoría, el título o la estructura cambiaron desde esta ficha. Revisa y aprueba una
              nueva revisión.
            </p>
          ) : null}
          <BriefForm
            key={`master-${data.master?.version ?? 0}`}
            data={data}
            canManage={canManage}
            onDirty={() => setMasterDirtyVersion(masterVersion)}
            saveDisabled={dirty}
          />
        </div>
      </details>
      {data.sections.length ? (
        <>
          <label className="field-label" htmlFor="writing-section">
            Capítulo o sección del manuscrito
          </label>
          <select
            id="writing-section"
            className="field-input"
            value={sectionId}
            onChange={(event) => {
              if (dirty) setPendingSection(event.target.value);
              else {
                setSectionId(event.target.value);
                setMessage({ status: "idle" });
              }
            }}
          >
            {data.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          {section ? (
            <div className="space-y-4">
              <h3 className="font-serif text-xl text-ink">Guía de «{section.title}»</h3>
              <Link
                className="text-sm text-accent underline"
                href={`/books/${data.book.id}/sections/${section.id}`}
              >
                Abrir esta sección en el editor
              </Link>
              {data.master ? (
                <BriefForm
                  key={`${section.id}-${version ?? 0}-${data.master.version}`}
                  data={data}
                  section={section}
                  canManage={canManage}
                  onDirty={() => setDirtyKey(currentKey)}
                />
              ) : (
                <p className="alert" role="status">
                  Guarda primero la ficha maestra para comenzar las guías de capítulos.
                </p>
              )}
            </div>
          ) : null}
          <div className="space-y-3 border-t border-line pt-4">
            <label className="field-label" htmlFor="writing-context-mode">
              Contexto anterior
            </label>
            <select
              id="writing-context-mode"
              className="field-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as "brief" | "complete")}
            >
              <option value="brief">Breve: hasta tres secciones previas</option>
              <option value="complete">Completo: todas las secciones previas</option>
            </select>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={pending}
              onClick={prepare}
            >
              {pending ? "Preparando…" : "Preparar instrucciones para IA"}
            </button>
            <p className="field-hint">
              Solo se utilizan guías y resúmenes aprobados. Los resúmenes desactualizados se señalan
              como faltantes. La IA externa puede desviarse: revisa su respuesta antes de
              incorporarla.
            </p>
          </div>
        </>
      ) : (
        <p className="alert">Crea las secciones del manuscrito para planificar sus capítulos.</p>
      )}
      <FormMessage state={message} />
      <Dialog abierto={Boolean(guide)} titulo="Instrucciones para la IA" onCerrar={closeGuide}>
        <textarea
          ref={guideRef}
          aria-label="Instrucciones listas para copiar"
          className="field-input max-h-[45dvh]"
          rows={10}
          value={guide}
          readOnly
        />
        <button className="btn btn-primary" type="button" onClick={() => void copy()}>
          Copiar instrucciones
        </button>
        <FormMessage state={message} />
      </Dialog>
      <Dialog
        abierto={pendingSection !== null}
        titulo="Cambios sin guardar"
        descripcion="La guía del capítulo tiene cambios sin guardar."
        onCerrar={() => setPendingSection(null)}
      >
        <button className="btn btn-secondary" type="button" onClick={() => setPendingSection(null)}>
          Seguir editando
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            setSectionId(pendingSection!);
            setPendingSection(null);
            setDirtyKey(null);
          }}
        >
          Descartar cambios y cambiar de capítulo
        </button>
      </Dialog>
    </section>
  );
}
