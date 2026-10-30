"use client";
import {
  useState,
  useTransition,
  useCallback,
  useRef,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Dialog } from "@/components/forms/dialog";
import { FormMessage } from "@/components/forms/form-message";
import type { ActionState } from "@/lib/action-state";
import {
  PLAN_KIND_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_VALUES,
  type PlanKind,
} from "@/lib/story/labels";
import { validParent, planDiagnostics } from "@/lib/story/modular/structure";
import { modularPlanAction } from "@/lib/story/modular/actions";
import type { ModularPlanData, ModularItem } from "@/lib/story/modular/queries";

type Modal = {
  mode: "edit" | "move" | "delete" | "apply" | "import" | "outline" | "template";
  id?: string;
  kind?: PlanKind;
  parentId?: string;
  version: number;
  sourceKey: string;
};
const kindLabel = (kind: PlanKind) => (kind === "ACT" ? "Parte" : PLAN_KIND_LABELS[kind]);
function EditCard({
  data,
  modal,
  busy,
  submit,
  onDirty,
}: {
  data: ModularPlanData;
  modal: Modal;
  busy: boolean;
  submit: (fields: Record<string, string>) => void;
  onDirty?: () => void;
}) {
  const item = data.items.find((n) => n.id === modal.id);
  const [values, setValues] = useState({
    title: item?.title ?? "",
    kind: item?.kind ?? modal.kind ?? "CHAPTER",
    parentId: item?.parentId ?? modal.parentId ?? "",
    sectionId: item?.sectionId ?? "",
    summary: item?.summary ?? "",
    goal: item?.goal ?? "",
    conflict: item?.conflict ?? "",
    outcome: item?.outcome ?? "",
    targetWords: String(item?.targetWords ?? ""),
    status: item?.status ?? "IDEA",
  });
  const set = (key: keyof typeof values, value: string) =>
    setValues((old) => ({ ...old, [key]: value }));
  function save(event: FormEvent) {
    event.preventDefault();
    submit({ operation: "save", id: item?.id ?? "", ...values });
  }
  const parents = data.items.filter(
    (n) => n.id !== item?.id && validParent(values.kind as PlanKind, n.kind),
  );
  const links = data.sections.filter((s) =>
    values.kind === "ACT"
      ? s.type === "PART"
      : values.kind === "CHAPTER" && ["CHAPTER", "PROLOGUE", "EPILOGUE"].includes(s.type),
  );
  return (
    <form onSubmit={save} onChange={onDirty} className="space-y-4">
      <div className="plan-dialog-body space-y-4">
        <label className="field-label">
          Título
          <input
            className="field-input"
            value={values.title}
            maxLength={300}
            required
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field-label">
            Tipo
            <select
              className="field-input"
              value={values.kind}
              onChange={(e) =>
                setValues((old) => ({
                  ...old,
                  kind: e.target.value as PlanKind,
                  parentId: "",
                  sectionId: "",
                }))
              }
            >
              {(["ACT", "CHAPTER", "SCENE", "SEQUENCE", "OTHER"] as const).map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Contenedor
            <select
              className="field-input"
              value={values.parentId}
              onChange={(e) => set("parentId", e.target.value)}
            >
              <option value="">Sin ubicar · nivel principal</option>
              {parents.map((n) => (
                <option key={n.id} value={n.id}>
                  {kindLabel(n.kind)} · {n.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-label">
          Resumen previsto
          <textarea
            className="field-input"
            rows={4}
            maxLength={20000}
            value={values.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="Qué sucede, qué cambia y por qué importa."
          />
        </label>
        <label className="field-label">
          Objetivo narrativo
          <textarea
            className="field-input"
            rows={2}
            maxLength={3000}
            value={values.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder="Qué aporta esta parte, capítulo o escena."
          />
        </label>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Arco, conflicto y desarrollo
          </summary>
          <div className="mt-3 space-y-3">
            <label className="field-label">
              Conflicto
              <textarea
                className="field-input"
                rows={2}
                maxLength={3000}
                value={values.conflict}
                onChange={(e) => set("conflict", e.target.value)}
              />
            </label>
            <label className="field-label">
              Cierre o cambio al finalizar
              <textarea
                className="field-input"
                rows={2}
                maxLength={3000}
                value={values.outcome}
                onChange={(e) => set("outcome", e.target.value)}
              />
            </label>
            <label className="field-label">
              Extensión orientativa (palabras)
              <input
                className="field-input"
                type="number"
                min={1}
                max={100000}
                value={values.targetWords}
                onChange={(e) => set("targetWords", e.target.value)}
              />
            </label>
          </div>
        </details>
        <label className="field-label">
          Estado de trabajo
          <select
            className="field-input"
            value={values.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {PLAN_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {PLAN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {values.kind !== "SCENE" ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Vincular con el manuscrito existente
            </summary>
            <label className="field-label mt-3">
              Sección vinculada
              <select
                className="field-input"
                value={values.sectionId}
                onChange={(e) => set("sectionId", e.target.value)}
              >
                <option value="">Todavía no está en el manuscrito</option>
                {values.sectionId && !links.some((section) => section.id === values.sectionId) ? (
                  <option value={values.sectionId} disabled>
                    Vínculo no disponible · selecciona otra opción
                  </option>
                ) : null}
                {links
                  .filter((s) => !data.items.some((n) => n.id !== item?.id && n.sectionId === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </label>
            <p className="field-hint">Vincular no cambia el texto ni el título de la sección.</p>
          </details>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Guardando…" : "Guardar tarjeta"}
      </button>
    </form>
  );
}
function MoveCard({
  data,
  modal,
  busy,
  submit,
  workflow = false,
}: {
  data: ModularPlanData;
  modal: Modal;
  busy: boolean;
  workflow?: boolean;
  submit: (fields: Record<string, string>) => void;
}) {
  const item = data.items.find((n) => n.id === modal.id)!;
  const [parentId, setParentId] = useState(item.parentId ?? "");
  const [beforeId, setBeforeId] = useState("");
  const [status, setStatus] = useState(item.status);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(
          workflow
            ? { operation: "status", id: item.id, status }
            : { operation: "move", id: item.id, parentId, beforeId },
        );
      }}
      className="space-y-4"
    >
      {workflow ? (
        <label className="field-label">
          Estado de destino
          <select
            className="field-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {PLAN_STATUS_VALUES.map((state) => (
              <option key={state} value={state}>
                {PLAN_STATUS_LABELS[state]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="field-label">
            Destino
            <select
              className="field-input"
              value={parentId}
              onChange={(e) => {
                setParentId(e.target.value);
                setBeforeId("");
              }}
            >
              <option value="">Sin ubicar · nivel principal</option>
              {data.items
                .filter((n) => n.id !== item.id && validParent(item.kind, n.kind))
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {kindLabel(n.kind)} · {n.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Posición
            <select
              className="field-input"
              value={beforeId}
              onChange={(e) => setBeforeId(e.target.value)}
            >
              <option value="">Al final del destino</option>
              {data.items
                .filter((n) => n.id !== item.id && (n.parentId ?? "") === parentId)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    Antes de «{n.title}»
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Moviendo…" : "Mover tarjeta"}
      </button>
    </form>
  );
}
function TemplateForm({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (fields: Record<string, string>) => void;
}) {
  const [template, setTemplate] = useState("THREE_ACTS");
  const [count, setCount] = useState("0");
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit({ operation: "template", template, chapterCount: count });
      }}
    >
      <p className="text-sm text-ink-soft">
        Crea contenedores y títulos provisionales. No se inventan personajes, escenas ni argumentos.
        Puedes renombrar y reorganizar todas las tarjetas.
      </p>
      <label className="field-label">
        Modelo inicial
        <select
          className="field-input"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          <option value="THREE_ACTS">Tres actos · planteamiento, desarrollo y desenlace</option>
          <option value="FIVE_PARTS">Cinco partes libres</option>
        </select>
      </label>
      <label className="field-label">
        Capítulos iniciales
        <input
          className="field-input"
          type="number"
          min={0}
          max={100}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          required
        />
      </label>
      <p className="field-hint">
        Deja 0 para crear solo las partes. Si indicas capítulos, se reparten en orden entre las
        partes.
      </p>
      <button className="btn btn-primary" disabled={busy} type="submit">
        Crear esquema inicial
      </button>
    </form>
  );
}
export function ModularPlanningBoard({
  data,
  canManage,
  initialSearch = "",
}: {
  data: ModularPlanData;
  canManage: boolean;
  initialSearch?: string;
}) {
  const [view, setView] = useState<"structure" | "flow">("structure");
  const [query, setQuery] = useState(initialSearch);
  const [kind, setKind] = useState("ALL");
  const [modal, setModal] = useState<Modal | null>(null);
  const [message, setMessage] = useState<ActionState>({ status: "idle" });
  const [busy, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const outlineRef = useRef<HTMLTextAreaElement>(null);
  const dirtyRef = useRef(false);
  const editingRef = useRef(false);
  const pendingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [discardPending, setDiscardPending] = useState(false);
  const close = useCallback(() => {
    if (pendingRef.current) return;
    if (editingRef.current && dirtyRef.current) setDiscardPending(true);
    else setModal(null);
  }, []);
  function open(mode: Modal["mode"], item?: ModularItem, newKind?: PlanKind, parentId?: string) {
    setMessage({ status: "idle" });
    dirtyRef.current = false;
    editingRef.current = mode === "edit";
    setDiscardPending(false);
    setModal({
      mode,
      id: item?.id,
      kind: newKind,
      parentId,
      version: data.book.narrativeVersion,
      sourceKey: data.manuscriptKey,
    });
  }
  function run(fields: Record<string, string>, pinned = modal) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    startTransition(async () => {
      try {
        const form = new FormData();
        Object.entries({
          bookId: data.book.id,
          version: String(pinned?.version ?? data.book.narrativeVersion),
          sourceKey: pinned?.sourceKey ?? data.manuscriptKey,
          ...fields,
        }).forEach(([k, v]) => form.set(k, v));
        const result = await modularPlanAction({ status: "idle" }, form);
        setMessage(result);
        if (result.status === "success") {
          dirtyRef.current = false;
          editingRef.current = false;
          setModal(null);
        }
      } catch {
        setMessage({
          status: "error",
          message: "No se pudo conectar. Conserva la edición y vuelve a intentarlo.",
        });
      } finally {
        pendingRef.current = false;
      }
    });
  }
  const groups = new Map<string | null, ModularItem[]>();
  for (const item of data.items) {
    const group = groups.get(item.parentId) ?? [];
    group.push(item);
    groups.set(item.parentId, group);
  }
  const children = (id: string | null) => groups.get(id) ?? [];
  const term = query.toLocaleLowerCase("es").trim();
  const matched = new Set(
    data.items
      .filter(
        (item) =>
          (kind === "ALL" || item.kind === kind) &&
          (!term ||
            `${item.title} ${item.summary ?? ""} ${item.goal ?? ""}`
              .toLocaleLowerCase("es")
              .includes(term)),
      )
      .map((item) => item.id),
  );
  const visibleIds = new Set(matched);
  for (const item of [...data.items].reverse())
    if (visibleIds.has(item.id) && item.parentId) visibleIds.add(item.parentId);
  const matches = (item: ModularItem) => matched.has(item.id);
  const visible = (item: ModularItem) => visibleIds.has(item.id);
  function drag(event: DragEvent, id: string) {
    event.stopPropagation();
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }
  function drop(event: DragEvent, parentId: string | null, beforeId: string | null = null) {
    event.preventDefault();
    event.stopPropagation();
    if (!canManage || busy) return;
    const id = event.dataTransfer.getData("text/plain");
    setDragId(null);
    if (!data.items.some((n) => n.id === id) || id === beforeId) return;
    run({ operation: "move", id, parentId: parentId ?? "", beforeId: beforeId ?? "" }, null);
  }
  function dropCard(event: DragEvent, target: ModularItem) {
    if (view === "flow") {
      event.preventDefault();
      event.stopPropagation();
      const id = event.dataTransfer.getData("text/plain");
      setDragId(null);
      if (canManage && !busy && data.items.some((n) => n.id === id))
        run({ operation: "status", id, status: target.status }, null);
      return;
    }
    const moving = data.items.find((n) => n.id === event.dataTransfer.getData("text/plain"));
    if (moving?.kind === "SCENE" && target.kind === "CHAPTER") drop(event, target.id);
    else drop(event, target.parentId, target.id);
  }
  const chapterNumbers = new Map(
    data.items.filter((n) => n.kind === "CHAPTER").map((n, i) => [n.id, i + 1]),
  );
  function card(item: ModularItem, nested = false) {
    const scenes = children(item.id);
    const section = data.sections.find((s) => s.id === item.sectionId);
    return (
      <article
        className={`plan-card ${nested ? "plan-card-scene" : ""} ${dragId === item.id ? "is-dragging" : ""}`}
        data-plan-id={item.id}
        draggable={canManage && !busy}
        onDragStart={(e) => drag(e, item.id)}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => dropCard(e, item)}
      >
        <div className="plan-card-meta">
          <span>
            {item.kind === "CHAPTER"
              ? `Capítulo ${chapterNumbers.get(item.id)}`
              : kindLabel(item.kind)}
          </span>
          <span className={`plan-state plan-state-${item.status.toLowerCase()}`}>
            {PLAN_STATUS_LABELS[item.status]}
          </span>
        </div>
        <h4>
          {canManage ? (
            <button
              type="button"
              className="plan-title-button"
              aria-label={`Editar «${item.title}»`}
              onClick={() => open("edit", item)}
            >
              {item.title}
            </button>
          ) : (
            item.title
          )}
        </h4>
        {item.summary ? (
          <p className="plan-card-summary">{item.summary}</p>
        ) : (
          <p className="plan-card-empty">Todavía sin resumen previsto.</p>
        )}
        {item.goal && !nested ? (
          <p className="plan-card-goal">
            <strong>Propósito</strong> {item.goal}
          </p>
        ) : null}
        {item.sectionId && !section ? (
          <p className="plan-card-warning">
            La sección vinculada ya no está disponible. Revisa el vínculo desde Editar.
          </p>
        ) : null}
        {section && section.title !== item.title ? (
          <p className="plan-card-warning">
            El título difiere del manuscrito. Revisa el vínculo antes de aplicar.
          </p>
        ) : null}
        <div className="plan-card-footer">
          <span>
            {item.targetWords
              ? `${item.targetWords.toLocaleString("es-PE")} palabras`
              : item.kind === "CHAPTER"
                ? `${scenes.length} escenas`
                : ""}
          </span>
          {canManage ? (
            <button
              type="button"
              disabled={busy}
              aria-label={`Mover «${item.title}»`}
              onClick={() => open("move", item)}
            >
              Mover ↗
            </button>
          ) : null}
        </div>
        {section ? (
          <div className="plan-card-links">
            <Link href={`/books/${data.book.id}/sections/${section.id}`}>Abrir editor</Link>
            {item.kind === "CHAPTER" ? (
              <Link href={`/planning?book=${data.book.id}&view=guides&section=${section.id}`}>
                Guía para IA →
              </Link>
            ) : null}
          </div>
        ) : null}
        {view === "structure" && !nested && scenes.length ? (
          <details className="plan-scenes">
            <summary>Escenas · {scenes.length}</summary>
            <ol>
              {scenes.filter(visible).map((s) => (
                <li key={s.id}>{card(s, true)}</li>
              ))}
            </ol>
          </details>
        ) : null}
        {canManage && view === "structure" && item.kind === "CHAPTER" ? (
          <button
            type="button"
            className="plan-add-scene"
            onClick={() => open("edit", undefined, "SCENE", item.id)}
          >
            + Añadir escena
          </button>
        ) : null}
      </article>
    );
  }
  const parts = data.items.filter((n) => n.kind === "ACT");
  const chapters = data.items.filter((n) => n.kind === "CHAPTER");
  const scenes = data.items.filter((n) => n.kind === "SCENE");
  const done = chapters.filter((n) => n.status === "DONE").length;
  const notes = planDiagnostics(data.items);
  const outline = data.items
    .map(
      (n) =>
        `${n.kind === "SCENE" ? "    " : n.parentId ? "  " : ""}${kindLabel(n.kind)}: ${n.title}\n${n.summary ?? ""}${n.goal ? `\nObjetivo: ${n.goal}` : ""}${n.conflict ? `\nConflicto: ${n.conflict}` : ""}${n.outcome ? `\nCierre: ${n.outcome}` : ""}`,
    )
    .join("\n\n");
  return (
    <section className="modular-planner" aria-labelledby="modular-plan-title">
      <header className="plan-overview">
        <div>
          <p className="eyebrow">Arquitectura literaria</p>
          <h2 id="modular-plan-title">El esqueleto de tu libro</h2>
          <p>Primero decide el recorrido. Después desarrolla cada capítulo.</p>
        </div>
        <div className="plan-metrics" aria-label="Resumen de la estructura">
          <span>
            <strong>{parts.length}</strong> partes
          </span>
          <span>
            <strong>{chapters.length}</strong> capítulos
          </span>
          <span>
            <strong>{scenes.length}</strong> escenas
          </span>
          <span>
            <strong>
              {done}/{chapters.length}
            </strong>{" "}
            terminados
          </span>
        </div>
      </header>
      <div className="plan-toolbar">
        <div className="plan-view-switch" role="group" aria-label="Vista del tablero">
          <button
            type="button"
            aria-pressed={view === "structure"}
            onClick={() => setView("structure")}
          >
            Estructura
          </button>
          <button type="button" aria-pressed={view === "flow"} onClick={() => setView("flow")}>
            Flujo de trabajo
          </button>
        </div>
        {canManage ? (
          <div className="plan-toolbar-actions">
            {!data.items.length ? (
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                disabled={busy}
                onClick={() => open("template")}
              >
                Crear esquema inicial
              </button>
            ) : null}
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={busy}
              onClick={() => open("edit", undefined, "ACT")}
            >
              + Parte
            </button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy}
              onClick={() => open("edit", undefined, "CHAPTER")}
            >
              + Capítulo
            </button>
          </div>
        ) : null}
      </div>
      <div className="plan-filter-row">
        <label className="sr-only" htmlFor="modular-search">
          Buscar en la estructura
        </label>
        <input
          id="modular-search"
          className="field-input"
          type="search"
          placeholder="Buscar capítulos, escenas o ideas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="sr-only" htmlFor="modular-kind">
          Tipo de tarjeta
        </label>
        <select
          id="modular-kind"
          className="field-input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="ALL">Todos los tipos</option>
          <option value="CHAPTER">Capítulos</option>
          <option value="SCENE">Escenas</option>
          <option value="ACT">Partes</option>
        </select>
      </div>
      <FormMessage state={message} />
      {notes.length ? (
        <details className="plan-diagnostics">
          <summary>
            Revisión del plan · {notes.length}{" "}
            {notes.length === 1 ? "observación" : "observaciones"}
          </summary>
          <ul>
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="plan-help">
        {canManage
          ? "Arrastra las tarjetas o usa «Mover» con teclado o desde el móvil. "
          : "Vista de lectura. "}
        El tablero y el manuscrito se sincronizan solo cuando aplicas la estructura.
      </p>
      <div
        className="plan-board-scroll"
        role="region"
        aria-label={view === "structure" ? "Partes y capítulos" : "Estados de escritura"}
        tabIndex={0}
      >
        <div className="plan-board-columns">
          {view === "structure" ? (
            <>
              <section
                className="plan-column plan-column-loose"
                aria-label="Sin parte"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(e, null)}
              >
                <header>
                  <div>
                    <span className="plan-column-kicker">Punto de partida</span>
                    <h3>Sin parte</h3>
                  </div>
                  <span className="plan-column-count">
                    {children(null).filter((n) => n.kind !== "ACT").length}
                  </span>
                </header>
                <p className="plan-column-description">
                  Ideas y capítulos por ubicar en el recorrido.
                </p>
                <ol className="plan-card-list">
                  {children(null)
                    .filter((n) => n.kind !== "ACT" && visible(n))
                    .map((n) => (
                      <li key={n.id}>{card(n)}</li>
                    ))}
                </ol>
                {!data.items.length ? (
                  <div className="plan-empty">
                    <strong>Todo libro empieza con una decisión.</strong>
                    <p>Añade una parte o tu primer capítulo. No se crea contenido de ejemplo.</p>
                  </div>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    className="plan-add-card"
                    onClick={() => open("edit", undefined, "CHAPTER")}
                  >
                    + Capítulo sin parte
                  </button>
                ) : null}
              </section>
              {parts.filter(visible).map((part) => (
                <section
                  key={part.id}
                  className="plan-column"
                  aria-label={`Parte: ${part.title}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, part.id)}
                >
                  <header
                    draggable={canManage && !busy}
                    onDragStart={(e) => drag(e, part.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const moving = data.items.find(
                        (n) => n.id === e.dataTransfer.getData("text/plain"),
                      );
                      if (moving?.kind === "ACT") drop(e, null, part.id);
                      else drop(e, part.id);
                    }}
                  >
                    <div>
                      <span className="plan-column-kicker">Parte {parts.indexOf(part) + 1}</span>
                      <h3>{part.title}</h3>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className="plan-more"
                        aria-label={`Editar parte «${part.title}»`}
                        onClick={() => open("edit", part)}
                      >
                        ⋯
                      </button>
                    ) : null}
                  </header>
                  {part.summary ? <p className="plan-column-description">{part.summary}</p> : null}
                  <div className="plan-part-tools">
                    <span>
                      {children(part.id).filter((n) => n.kind === "CHAPTER").length} capítulos
                    </span>
                    {canManage ? (
                      <button
                        type="button"
                        aria-label={`Mover parte «${part.title}»`}
                        onClick={() => open("move", part)}
                      >
                        Mover ↗
                      </button>
                    ) : null}
                  </div>
                  <ol className="plan-card-list">
                    {children(part.id)
                      .filter(visible)
                      .map((n) => (
                        <li key={n.id}>{card(n)}</li>
                      ))}
                  </ol>
                  {canManage ? (
                    <button
                      type="button"
                      className="plan-add-card"
                      onClick={() => open("edit", undefined, "CHAPTER", part.id)}
                    >
                      + Añadir capítulo
                    </button>
                  ) : null}
                </section>
              ))}
            </>
          ) : (
            PLAN_STATUS_VALUES.map((status) => (
              <section
                key={status}
                className="plan-column"
                aria-label={`Estado: ${PLAN_STATUS_LABELS[status]}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id = e.dataTransfer.getData("text/plain");
                  setDragId(null);
                  if (canManage && !busy && data.items.some((n) => n.id === id))
                    run({ operation: "status", id, status }, null);
                }}
              >
                <header>
                  <div>
                    <span className="plan-column-kicker">Flujo de trabajo</span>
                    <h3>{PLAN_STATUS_LABELS[status]}</h3>
                  </div>
                  <span className="plan-column-count">
                    {data.items.filter((n) => n.kind !== "ACT" && n.status === status).length}
                  </span>
                </header>
                <ol className="plan-card-list">
                  {data.items
                    .filter((n) => n.kind !== "ACT" && n.status === status && matches(n))
                    .map((n) => (
                      <li key={n.id}>
                        <div className="plan-breadcrumb">
                          {data.items.find((p) => p.id === n.parentId)?.title ?? "Sin contenedor"}
                        </div>
                        {card(n)}
                      </li>
                    ))}
                </ol>
              </section>
            ))
          )}
        </div>
      </div>
      <footer className="plan-bottom-actions">
        {canManage ? (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => open("import")}
            >
              Traer del manuscrito
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !chapters.length}
              onClick={() => open("apply")}
            >
              Aplicar estructura al manuscrito
            </button>
          </>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => open("outline")}>
          Copiar estructura
        </button>
        <span className="text-xs text-ink-muted" role="status">
          {busy ? "Guardando cambios…" : `Revisión del plan ${data.book.narrativeVersion}`}
        </span>
      </footer>
      <Dialog
        abierto={modal !== null}
        titulo={
          modal?.mode === "edit"
            ? modal.id
              ? "Editar tarjeta"
              : "Nueva tarjeta"
            : modal?.mode === "move"
              ? "Mover tarjeta"
              : modal?.mode === "apply"
                ? "Aplicar estructura al manuscrito"
                : modal?.mode === "import"
                  ? "Traer estructura existente"
                  : modal?.mode === "template"
                    ? "Esquema inicial del libro"
                    : modal?.mode === "delete"
                      ? "Archivar tarjeta"
                      : "Estructura literaria"
        }
        onCerrar={close}
      >
        {modal?.mode === "edit" ? (
          <div ref={editorRef} hidden={discardPending}>
            <EditCard
              key={`${modal.mode}-${modal.id ?? modal.kind}-${modal.parentId ?? ""}-${modal.version}`}
              data={data}
              modal={modal}
              busy={busy}
              submit={(fields) => run(fields)}
              onDirty={() => {
                dirtyRef.current = true;
              }}
            />
            {modal.id ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-danger"
                onClick={() => {
                  editingRef.current = false;
                  setModal({ ...modal, mode: "delete" });
                }}
              >
                Archivar esta tarjeta
              </button>
            ) : null}
          </div>
        ) : null}
        {discardPending && modal?.mode === "edit" ? (
          <div className="space-y-4">
            <p>Hay cambios sin guardar en esta tarjeta.</p>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setDiscardPending(false);
                requestAnimationFrame(() => editorRef.current?.querySelector("input")?.focus());
              }}
            >
              Seguir editando
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                dirtyRef.current = false;
                editingRef.current = false;
                setDiscardPending(false);
                setModal(null);
              }}
            >
              Descartar cambios y cerrar
            </button>
          </div>
        ) : null}
        {modal?.mode === "template" ? (
          <TemplateForm busy={busy} submit={(fields) => run(fields)} />
        ) : null}
        {modal?.mode === "move" ? (
          <MoveCard
            workflow={view === "flow"}
            key={modal.id}
            data={data}
            modal={modal}
            busy={busy}
            submit={(fields) => run(fields)}
          />
        ) : null}
        {modal?.mode === "delete" ? (
          <>
            <p className="text-sm text-ink-soft">
              La tarjeta se archivará; la sección del manuscrito conservará su texto. Si contiene
              capítulos o escenas, debes moverlos primero.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run({ operation: "delete", id: modal.id! })}
            >
              Sí, archivar tarjeta
            </button>
          </>
        ) : null}
        {modal?.mode === "apply" ? (
          <>
            <p className="text-sm text-ink-soft">
              Se crearán las partes y capítulos faltantes y se aplicarán sus dependencias y orden.
              Se conservarán los textos y títulos de las secciones ya vinculadas. Las escenas siguen
              en el plan.
            </p>
            <p className="alert" role="status">
              {
                data.items.filter((n) => (n.kind === "ACT" || n.kind === "CHAPTER") && !n.sectionId)
                  .length
              }{" "}
              secciones nuevas previstas. Los cambios pueden dejar desactualizada la ficha maestra
              para IA; tendrás que revisarla.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run({ operation: "apply" })}
            >
              {busy ? "Aplicando…" : "Confirmar y aplicar estructura"}
            </button>
          </>
        ) : null}
        {modal?.mode === "import" ? (
          <>
            <p className="text-sm text-ink-soft">
              Las partes, capítulos, prólogos y epílogos del libro aparecerán como tarjetas
              vinculadas. No se cambia el texto ni se duplican vínculos existentes. Las tarjetas con
              títulos ambiguos requieren revisión manual.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run({ operation: "import" })}
            >
              Vincular secciones existentes
            </button>
          </>
        ) : null}
        {modal?.mode === "outline" ? (
          <>
            <textarea
              className="field-input max-h-[45dvh]"
              rows={12}
              ref={outlineRef}
              aria-label="Estructura lista para copiar"
              value={`ESTRUCTURA LITERARIA · ${data.book.title}\n\n${outline || "Sin tarjetas todavía."}`}
              readOnly
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(outlineRef.current!.value);
                  setMessage({ status: "success", message: "Estructura copiada." });
                } catch {
                  outlineRef.current?.focus();
                  outlineRef.current?.select();
                  setMessage({
                    status: "error",
                    message:
                      "Selecciona y copia manualmente el texto; el navegador no permitió acceder al portapapeles.",
                  });
                }
              }}
            >
              Copiar al portapapeles
            </button>
          </>
        ) : null}
        <FormMessage state={message} />
      </Dialog>
    </section>
  );
}
