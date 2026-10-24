"use client";
import { AUTOSAVE_MIN_INTERVAL_MS } from "@/lib/editor/autosave";
import { FOOTNOTE_EDIT_EVENT, parseFootnoteEdit } from "@/lib/editor/footnote-edit";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  countWordsInDocument,
  LinguisticAnalysisEngine,
  MAX_FOOTNOTE_LENGTH,
  type TiptapDocument,
} from "@escribiendo/book-schema";
import { esEnlaceSeguro } from "@escribiendo/shared";
import { Dialog } from "@/components/forms/dialog";
import { saveSectionAction } from "@/lib/books/actions";
import { formatNumber } from "@/lib/ui/format";
import {
  applyWritingPreferences,
  readWritingPreferences,
} from "@/components/writing/writing-preferences";
import { deleteDraft, loadDraft, saveDraft, type DraftRecord } from "@/lib/editor/drafts";
import {
  hasUnsavedWork,
  initialSyncMachine,
  reduceSync,
  shouldSync,
  statusMessage,
  type SectionConflict,
  type SyncMachine,
} from "@/lib/editor/sync";
import { SectionConflictPanel } from "@/components/books/section-conflict";
import { EditorToolbar } from "@/components/books/editor-toolbar";
import type { EditorialFindingStatus } from "@escribiendo/book-schema";
import type { ProofreadingIssue } from "@/lib/editor/local-proofreader";
import { analyzeLocalSection } from "@/lib/editor/linguistic-rules";
import { SectionImageControls } from "@/components/books/section-image-controls";
import { EditorialFootnote } from "@/components/editor/editorial-footnote";
import {
  ManuscriptSearchHighlights,
  manuscriptSearchPluginKey,
} from "@/components/editor/manuscript-search-highlights";
import { EditorialImage } from "@/components/editor/editorial-image";
import { StudioIcon } from "./studio-icon";
import { readingMinutes, textMatches } from "@/lib/books/studio";
import type { BookAssetSummary } from "@/lib/books/assets";

interface SectionEditorProps {
  sectionId: string;
  sectionTitle: string;
  bookId: string;
  userId: string;
  content: TiptapDocument;
  version: number;
  wordCount: number;
  canEdit: boolean;
  bookAssets: BookAssetSummary[];
}

/**
 * Espera antes de escribir el borrador en el equipo, en milisegundos.
 *
 * Es corta: el objetivo es que el trabajo esté a salvo en cuanto se deja de
 * escribir, no esperar a que termine la frase.
 */
const LOCAL_SAVE_DEBOUNCE_MS = 700;

/**
 * Espera antes de enviar el texto al servidor, en milisegundos.
 *
 * El servidor vuelve a limitar la frecuencia de los guardados automáticos;
 * esta espera es solo para no enviar una petición por cada pulsación.
 */
const SERVER_SYNC_DEBOUNCE_MS = 3_000;

export function SectionEditor({
  sectionId,
  sectionTitle,
  bookId,
  userId,
  content,
  version,
  wordCount,
  canEdit,
  bookAssets,
}: SectionEditorProps) {
  const router = useRouter();
  const [machine, setMachine] = useState<SyncMachine>(() => initialSyncMachine(version));
  const [conflict, setConflict] = useState<SectionConflict | null>(null);
  /**
   * Diálogo abierto: el enlace o la nota al pie que se está escribiendo.
   *
   * Antes se pedían con `window.prompt`, que bloquea la interfaz y no se
   * puede validar mientras se escribe.
   */
  const [dialogo, setDialogo] = useState<{
    tipo: "enlace" | "nota";
    noteId?: string;
    valor: string;
    /** Selección en el momento de abrir el diálogo, para poder volver a ella. */
    desde: number;
    hasta: number;
  } | null>(null);
  /**
   * Contenido del borrador local cuando el servidor tiene otra versión.
   *
   * El comparador necesita las dos versiones: la del servidor y la del
   * equipo. Sin guardar la del equipo, el trabajo sin confirmar se perdía
   * en silencio.
   */
  const [borradorLocal, setBorradorLocal] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [recovered, setRecovered] = useState(false);
  const [assets, setAssets] = useState<BookAssetSummary[]>(() => bookAssets);

  const [imageToolsOpen, setImageToolsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [proofreadingIssues, setProofreadingIssues] = useState<ProofreadingIssue[] | null>(null);
  const [proofreadingStale, setProofreadingStale] = useState(false);
  const [proofreadingApplied, setProofreadingApplied] = useState(0);
  const [proofreadingLoading, setProofreadingLoading] = useState(false);
  const [proofreadingError, setProofreadingError] = useState<string | null>(null);
  const proofreadingIssuesRef = useRef<ProofreadingIssue[] | null>(null);
  const linguisticEngineRef = useRef<LinguisticAnalysisEngine | null>(null);
  if (linguisticEngineRef.current === null) {
    linguisticEngineRef.current = new LinguisticAnalysisEngine({ maxCachedSections: 50 });
  }
  const proofreadingRequestRef = useRef(0);
  const findingStatusesRef = useRef(new Map<string, EditorialFindingStatus>());
  const searchPosition = useRef({ query: "", from: -1 });

  const machineRef = useRef(machine);
  const versionRef = useRef(version);
  const sectionTitleRef = useRef(sectionTitle);
  useEffect(() => {
    sectionTitleRef.current = sectionTitle;
  }, [sectionTitle]);
  const latestContentRef = useRef(JSON.stringify(content));
  const flushPendingRef = useRef<() => void>(() => undefined);
  const flushAfterRequestRef = useRef(false);
  const localVersionRef = useRef(0);
  /** Número de la petición en curso: descarta respuestas fuera de orden. */
  const requestRef = useRef(0);
  const localTimer = useRef<number | null>(null);
  const syncTimer = useRef<number | null>(null);
  const autosaveNotBeforeRef = useRef(0);
  const retryTimer = useRef<number | null>(null);

  const dispatch = useCallback((event: Parameters<typeof reduceSync>[1]) => {
    setMachine((current) => {
      const next = reduceSync(current, event);
      machineRef.current = next;
      return next;
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // El enlace se edita, no se navega: un clic dentro del manuscrito no
        // debe sacar al autor de la página.
        link: { openOnClick: false },
      }),
      EditorialImage,
      EditorialFootnote,
      ManuscriptSearchHighlights,
    ],
    content,
    // El editor se inicializa en el cliente: sin esta opción, Next.js
    // intentaría renderizarlo en el servidor y la hidratación no coincidiría.
    immediatelyRender: false,
    editable: canEdit,
    editorProps: {
      attributes: {
        // ProseMirror es un campo de texto editable: sin nombre accesible, un
        // lector de pantalla anuncia «grupo editable» y no dice qué es.
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": `Manuscrito de la sección «${sectionTitle}»`,
        spellcheck: "false",
        ...(canEdit ? {} : { "aria-readonly": "true" }),
      },
    },
    onUpdate: ({ editor: current }) => {
      latestContentRef.current = JSON.stringify(current.getJSON());
      if (proofreadingIssuesRef.current) setProofreadingStale(true);
      if (!canEdit) {
        return;
      }

      localVersionRef.current += 1;
      dispatch({ type: "edit" });
    },
  });

  const liveStats = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            imageSelected: current.isActive("image"),
            words: countWordsInDocument(current.getJSON() as TiptapDocument),
            characters: current.getText().length,
          }
        : null,
  });

  useEffect(() => {
    const search = (event: Event): void => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string" || !editor) return;
      const query = event.detail;
      editor.view.dispatch(editor.state.tr.setMeta(manuscriptSearchPluginKey, query));
      const matches: Array<{ from: number; to: number }> = [];
      editor.state.doc.descendants((node, position) => {
        if (node.isTextblock) {
          const text = node.textBetween(0, node.content.size, "\n", "\ufffc");
          for (const match of textMatches(text, query))
            matches.push({ from: position + 1 + match.from, to: position + 1 + match.to });
          return false;
        }
      });
      const previous = searchPosition.current;
      let index =
        previous.query === query ? matches.findIndex((match) => match.from > previous.from) : 0;
      if (index < 0) index = 0;
      const selected = matches[index];
      if (selected) {
        editor.chain().focus().setTextSelection(selected).scrollIntoView().run();
        searchPosition.current = { query, from: selected.from };
      }
      window.dispatchEvent(
        new CustomEvent("studio-search-result", {
          detail: selected
            ? `${index + 1} de ${matches.length} en este capítulo`
            : "Sin coincidencias en este capítulo",
        }),
      );
    };
    const highlight = (event: Event): void => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string" || !editor) return;
      editor.view.dispatch(editor.state.tr.setMeta(manuscriptSearchPluginKey, event.detail));
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("studio-search", search);
    window.addEventListener("studio-search-highlight", highlight);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("studio-search", search);
      window.removeEventListener("studio-search-highlight", highlight);
      window.removeEventListener("keydown", escape);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !canEdit) return;
    const openNote = (event: Event) => {
      const detail = parseFootnoteEdit((event as CustomEvent<unknown>).detail);
      if (!detail) return;
      const node = editor.state.doc.nodeAt(detail.pos);
      if (node?.type.name !== "footnote" || node.attrs.id !== detail.id) return;
      setDialogo({
        tipo: "nota",
        valor: detail.note,
        noteId: detail.id,
        desde: detail.pos,
        hasta: detail.pos + node.nodeSize,
      });
    };
    const dom = editor.view.dom;
    dom.addEventListener(FOOTNOTE_EDIT_EVENT, openNote);
    return () => dom.removeEventListener(FOOTNOTE_EDIT_EVENT, openNote);
  }, [canEdit, editor]);

  // --- Recuperación del borrador local -------------------------------------

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    let vivo = true;

    const recuperar = async (): Promise<void> => {
      const borrador = await loadDraft(userId, bookId, sectionId);

      if (!vivo || !borrador || !editor) {
        return;
      }

      // El borrador solo se recupera si es más reciente que lo que hay en el
      // servidor. Si el servidor ya está en otra versión, no se descarta
      // ninguna de las dos: se abre el comparador para que la persona
      // decida. Antes el borrador se perdía en silencio y el siguiente
      // autoguardado lo sobrescribía.
      if (borrador.baseVersion !== versionRef.current) {
        setBorradorLocal(borrador.content);
        setConflict({
          serverVersion: versionRef.current,
          serverContent: JSON.stringify(editor.getJSON() as TiptapDocument),
          serverTitle: sectionTitleRef.current,
          serverAuthor: null,
        });
        dispatch({ type: "sync-conflict" });
        return;
      }

      if (borrador.syncState === "synced") {
        await deleteDraft(userId, bookId, sectionId);
        return;
      }

      // Un borrador corrupto no rompe la página: se avisa y se sigue con la
      // versión del servidor.
      try {
        editor.commands.setContent(JSON.parse(borrador.content) as TiptapDocument);
      } catch {
        setRecovered(false);
        dispatch({ type: "sync-error", message: "El borrador de este equipo está dañado." });
        return;
      }

      localVersionRef.current = Math.max(localVersionRef.current, borrador.localVersion);
      dispatch({ type: "recovered" });
      setRecovered(true);
    };

    void recuperar();

    return () => {
      vivo = false;
    };
  }, [bookId, canEdit, dispatch, editor, sectionId, userId]);

  // --- Guardado local ------------------------------------------------------

  const guardarLocal = useCallback(async () => {
    const editorActual = editor;

    if (!editorActual) {
      return;
    }

    const contenido = JSON.stringify(editorActual.getJSON());
    const registro: DraftRecord = {
      key: `${userId}:${bookId}:${sectionId}`,
      userId,
      bookId,
      sectionId,
      baseVersion: versionRef.current,
      localVersion: localVersionRef.current,
      content: contenido,
      updatedAt: new Date().toISOString(),
      syncState: "local",
      serverVersion: versionRef.current,
    };

    await saveDraft(registro);
    dispatch({ type: "local-saved" });
  }, [bookId, dispatch, editor, sectionId, userId]);

  // --- Sincronización con el servidor --------------------------------------

  const sincronizar = useCallback(
    async (intent: "manual" | "autosave", forzar = false) => {
      const editorActual = editor;
      const estado = machineRef.current;

      if (!editorActual || !canEdit) {
        return;
      }

      const remaining = autosaveNotBeforeRef.current - Date.now();
      if (intent === "autosave" && remaining > 0) {
        dispatch({ type: "sync-throttled", retryAfterMs: remaining });
        return;
      }

      if (estado.state === "syncing") {
        return;
      }

      if (!forzar && estado.state === "conflict") {
        return;
      }

      if (!navigator.onLine) {
        dispatch({ type: "sync-offline" });
        return;
      }

      const peticion = requestRef.current + 1;
      requestRef.current = peticion;

      const versionLocalAlEnviar = localVersionRef.current;

      dispatch({ type: "sync-start" });

      const formData = new FormData();
      formData.set("sectionId", sectionId);
      formData.set("version", String(versionRef.current));
      formData.set("content", latestContentRef.current);
      formData.set("intent", intent);

      if (forzar) {
        formData.set("force", "on");
      }

      try {
        const resultado = await saveSectionAction({ status: "idle" }, formData);

        // Una respuesta más antigua que otra ya aplicada se ignora: si no,
        // una versión vieja podría dejar el editor como «guardado» cuando ya
        // no lo está.
        if (peticion !== requestRef.current) {
          return;
        }

        if (resultado.conflict) {
          setConflict(resultado.conflict);
          dispatch({ type: "sync-conflict" });
          return;
        }

        if (resultado.status === "error") {
          dispatch({ type: "sync-error", message: resultado.message });
          return;
        }

        if (resultado.throttled) {
          // El servidor ha pospuesto el guardado: el texto sigue pendiente.
          const retryAfterMs = resultado.retryAfterMs ?? AUTOSAVE_MIN_INTERVAL_MS;
          autosaveNotBeforeRef.current = Date.now() + retryAfterMs;
          dispatch({ type: "sync-throttled", retryAfterMs });
          return;
        }

        if (resultado.analysisTaskId) {
          void fetch("/api/story-analysis/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: resultado.analysisTaskId }),
            keepalive: true,
          }).catch(() => undefined);
        }

        autosaveNotBeforeRef.current = 0;
        const versionGuardada = resultado.savedVersion ?? versionRef.current;
        versionRef.current = versionGuardada;

        // Si se ha escrito mientras la petición estaba en curso, lo guardado
        // es una versión anterior: el texto nuevo sigue pendiente.
        if (localVersionRef.current !== versionLocalAlEnviar) {
          dispatch({ type: "edit" });
        } else {
          dispatch({ type: "sync-ok", version: versionGuardada });
          await deleteDraft(userId, bookId, sectionId);
          router.refresh();
        }
      } catch {
        if (peticion !== requestRef.current) {
          return;
        }

        dispatch({ type: "sync-offline" });
      } finally {
        if (flushAfterRequestRef.current && peticion === requestRef.current) {
          flushAfterRequestRef.current = false;
          flushPendingRef.current();
        }
      }
    },
    [bookId, canEdit, dispatch, editor, router, sectionId, userId],
  );

  // --- Programación de las tareas ------------------------------------------

  const programarSincronizacion = useCallback(
    (ms: number) => {
      if (syncTimer.current !== null) {
        window.clearTimeout(syncTimer.current);
      }

      syncTimer.current = window.setTimeout(
        () => {
          syncTimer.current = null;

          if (shouldSync(machineRef.current)) {
            void sincronizar("autosave");
          }
        },
        Math.max(ms, autosaveNotBeforeRef.current - Date.now()),
      );
    },
    [sincronizar],
  );

  const programarReintento = useCallback(() => {
    const espera = machineRef.current.retryInMs;

    if (espera === null) {
      return;
    }

    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current);
    }

    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;

      if (shouldSync(machineRef.current)) {
        void sincronizar("autosave");
      }
    }, espera);
  }, [sincronizar]);

  // Cada cambio programa el guardado local y la sincronización.
  useEffect(() => {
    if (!canEdit || !hasUnsavedWork(machine)) {
      return;
    }

    if (localTimer.current !== null) {
      window.clearTimeout(localTimer.current);
    }

    localTimer.current = window.setTimeout(() => {
      localTimer.current = null;
      void guardarLocal();
    }, LOCAL_SAVE_DEBOUNCE_MS);

    programarSincronizacion(SERVER_SYNC_DEBOUNCE_MS);
  }, [canEdit, guardarLocal, machine, programarSincronizacion]);

  // Reintento con espera creciente cuando el servidor falla.
  useEffect(() => {
    if (machine.state === "error" || machine.state === "offline") {
      programarReintento();
    }
  }, [machine, programarReintento]);

  // Conexión: se detecta con los eventos del navegador.
  useEffect(() => {
    const actualizar = (): void => setOnline(navigator.onLine);

    actualizar();

    const alPerder = (): void => {
      setOnline(false);
      dispatch({ type: "sync-offline" });
    };

    const alRecuperar = (): void => {
      setOnline(true);

      if (shouldSync(machineRef.current)) {
        void sincronizar("autosave");
      }
    };

    window.addEventListener("online", alRecuperar);
    window.addEventListener("offline", alPerder);

    return () => {
      window.removeEventListener("online", alRecuperar);
      window.removeEventListener("offline", alPerder);
    };
  }, [dispatch, sincronizar]);

  // Conserva una instantánea antes de abandonar la página, incluso durante un envío.
  useEffect(() => {
    flushPendingRef.current = () => {
      if (!canEdit || !hasUnsavedWork(machineRef.current)) return;
      void saveDraft({
        key: `${userId}:${bookId}:${sectionId}`,
        userId,
        bookId,
        sectionId,
        baseVersion: versionRef.current,
        serverVersion: versionRef.current,
        localVersion: localVersionRef.current,
        content: latestContentRef.current,
        updatedAt: new Date().toISOString(),
        syncState: "local",
      });
      if (machineRef.current.state === "syncing") {
        flushAfterRequestRef.current = true;
      } else if (machineRef.current.state !== "conflict") {
        void sincronizar("manual");
      }
    };
  }, [bookId, canEdit, sectionId, sincronizar, userId]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushPendingRef.current();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  // Limpieza de los temporizadores al desmontar.
  useEffect(
    () => () => {
      flushPendingRef.current();
      if (localTimer.current !== null) {
        window.clearTimeout(localTimer.current);
      }

      if (syncTimer.current !== null) {
        window.clearTimeout(syncTimer.current);
      }

      if (retryTimer.current !== null) {
        window.clearTimeout(retryTimer.current);
      }
    },
    [],
  );

  // Las preferencias de escritura se aplican al documento para que el CSS
  // las use, y se vuelven a aplicar si cambian en otra pestaña.
  useEffect(() => {
    applyWritingPreferences(readWritingPreferences());

    const onStorage = (event: StorageEvent) => {
      if (event.key === "escribiendo-writing-preferences") {
        applyWritingPreferences(readWritingPreferences());
      }
    };

    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Aviso al cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!hasUnsavedWork(machine)) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [machine]);

  // Atajos de teclado: guardar con Ctrl/Cmd+S, sin que el navegador abra
  // el diálogo de «guardar página».
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
        return;
      }

      event.preventDefault();
      void sincronizar("manual");
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sincronizar]);

  const currentWords = liveStats?.words ?? wordCount;

  const revisarTextoLocal = async (): Promise<void> => {
    if (!editor || !linguisticEngineRef.current) return;
    const requestId = ++proofreadingRequestRef.current;
    const documentAtStart = editor.state.doc;
    const documentSnapshot = documentAtStart.toJSON() as TiptapDocument;
    setProofreadingLoading(true);
    setProofreadingError(null);
    setProofreadingIssues([]);
    proofreadingIssuesRef.current = [];

    try {
      const issues = await analyzeLocalSection(
        linguisticEngineRef.current,
        {
          bookId,
          sectionId,
          sectionTitle: sectionTitleRef.current,
          contentVersion: Math.max(1, versionRef.current),
          document: documentSnapshot,
        },
        {
          enabledByRuleId: readWritingPreferences().editorialRulesEnabled,
          previousFindings: Array.from(findingStatusesRef.current, ([id, status]) => ({
            id,
            status,
          })),
        },
      );

      if (
        requestId !== proofreadingRequestRef.current ||
        editor.isDestroyed ||
        !editor.state.doc.eq(documentAtStart)
      ) {
        return;
      }

      proofreadingIssuesRef.current = issues;
      setProofreadingIssues(issues);
      setProofreadingStale(false);
      setProofreadingApplied(0);
    } catch {
      if (requestId === proofreadingRequestRef.current) {
        setProofreadingError("No se pudo analizar este borrador localmente. Vuelve a intentarlo.");
      }
    } finally {
      if (requestId === proofreadingRequestRef.current) setProofreadingLoading(false);
    }
  };

  const descartarRevisionLocal = (): void => {
    proofreadingRequestRef.current += 1;
    proofreadingIssuesRef.current = null;
    setProofreadingIssues(null);
    setProofreadingStale(false);
    setProofreadingLoading(false);
    setProofreadingError(null);
  };

  const ignorarCorreccion = (issueId: string): void => {
    findingStatusesRef.current.set(issueId, "ignored");
    const next = proofreadingIssuesRef.current?.filter((issue) => issue.id !== issueId) ?? null;
    proofreadingIssuesRef.current = next;
    setProofreadingIssues(next);
  };

  const aplicarCorreccion = (issue: ProofreadingIssue): void => {
    if (!editor || proofreadingStale) return;
    const currentText = editor.state.doc.textBetween(issue.from, issue.to, "\n", "\ufffc");
    if (currentText !== issue.original) {
      void revisarTextoLocal();
      return;
    }

    const transaction = editor.state.tr.insertText(issue.suggestion, issue.from, issue.to);
    editor.view.dispatch(transaction);
    editor.commands.focus();
    const shift = issue.suggestion.length - issue.original.length;
    const next =
      proofreadingIssuesRef.current
        ?.filter((candidate) => candidate.id !== issue.id)
        .flatMap((candidate) => {
          if (candidate.from >= issue.to) {
            return [{ ...candidate, from: candidate.from + shift, to: candidate.to + shift }];
          }
          return candidate.to <= issue.from ? [candidate] : [];
        }) ?? [];
    proofreadingIssuesRef.current = next;
    setProofreadingIssues(next);
    setProofreadingApplied((count) => count + 1);
    setProofreadingStale(false);
  };

  const abrirEnlace = (): void => {
    if (!editor) {
      return;
    }

    const anterior = editor.getAttributes("link").href;

    setDialogo({
      tipo: "enlace",
      valor: typeof anterior === "string" ? anterior : "",
      desde: editor.state.selection.from,
      hasta: editor.state.selection.to,
    });
  };

  const abrirNota = (): void => {
    if (!editor) {
      return;
    }

    setDialogo({
      tipo: "nota",
      valor: "",
      desde: editor.state.selection.from,
      hasta: editor.state.selection.to,
    });
  };

  const mensaje = statusMessage(machine);
  const sincronizando = machine.state === "syncing";

  return (
    <div className={`studio-editor-body ${focused ? "is-focused" : ""}`}>
      {canEdit ? (
        <EditorToolbar
          editor={editor}
          onLink={abrirEnlace}
          onFootnote={abrirNota}
          onImage={() => setImageToolsOpen((value) => !value)}
          onProofread={revisarTextoLocal}
        />
      ) : null}

      {canEdit && proofreadingIssues !== null ? (
        <section className="local-proofreader" aria-labelledby="local-proofreader-heading">
          <header className="local-proofreader__header">
            <div>
              <h2 id="local-proofreader-heading">Corrector local</h2>
              <p>
                Revisa reglas frecuentes en español (hasta 100 propuestas). El análisis ocurre en
                esta página y no envía texto a servicios externos. Las propuestas no cambian el
                manuscrito hasta que las aceptes.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={descartarRevisionLocal}
              aria-label="Cerrar corrector local"
            >
              Cerrar
            </button>
          </header>
          {proofreadingStale ? (
            <div className="local-proofreader__notice" role="status">
              El texto cambió después de la revisión. Vuelve a revisar antes de aplicar propuestas.
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={revisarTextoLocal}
              >
                Revisar de nuevo
              </button>
            </div>
          ) : null}
          {proofreadingLoading ? (
            <p className="local-proofreader__summary" role="status">
              Analizando este borrador en el navegador…
            </p>
          ) : null}
          {proofreadingError ? (
            <p className="local-proofreader__notice" role="alert">
              {proofreadingError}
            </p>
          ) : null}
          {!proofreadingLoading && !proofreadingError && proofreadingIssues.length ? (
            <>
              <p className="local-proofreader__summary" aria-live="polite">
                {proofreadingIssues.length} propuesta{proofreadingIssues.length === 1 ? "" : "s"}{" "}
                por revisar
                {proofreadingApplied
                  ? ` · ${proofreadingApplied} aplicada${proofreadingApplied === 1 ? "" : "s"}`
                  : ""}
                .
              </p>
              <ul className="local-proofreader__list">
                {proofreadingIssues.map((issue) => (
                  <li key={issue.id} className="local-proofreader__item">
                    <div className="local-proofreader__suggestion">
                      <del>{issue.original}</del>
                      <span aria-hidden="true">→</span>
                      <strong>{issue.suggestion}</strong>
                    </div>
                    <p>{issue.explanation}</p>
                    <div className="local-proofreader__actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={proofreadingStale}
                        onClick={() => aplicarCorreccion(issue)}
                      >
                        Aplicar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={proofreadingStale}
                        onClick={() => ignorarCorreccion(issue.id)}
                      >
                        Ignorar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {!proofreadingLoading && !proofreadingError && !proofreadingIssues.length ? (
            <p className="local-proofreader__summary" role="status">
              No se encontraron problemas cubiertos por las reglas locales. Esto no garantiza que el
              texto esté libre de errores.
              {proofreadingApplied
                ? ` Has aplicado ${proofreadingApplied} corrección${proofreadingApplied === 1 ? "" : "es"}.`
                : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {canEdit && (imageToolsOpen || liveStats?.imageSelected) ? (
        <SectionImageControls
          editor={editor}
          bookId={bookId}
          assets={assets}
          onAssetRegistered={(asset) => {
            setAssets((current) =>
              current.some((item) => item.id === asset.id) ? current : [...current, asset],
            );
          }}
        />
      ) : null}

      {dialogo?.tipo === "enlace" ? (
        <Dialog
          abierto
          titulo="Enlace"
          descripcion="Se puede apuntar a una página web, a un correo o a un teléfono. Un esquema distinto no se guarda, porque el archivo exportado se abre en el equipo de quien lo recibe."
          onCerrar={() => setDialogo(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(evento) => {
              evento.preventDefault();

              if (!editor) {
                return;
              }

              const limpio = dialogo.valor.trim();

              if (limpio.length === 0) {
                editor
                  .chain()
                  .focus()
                  .setTextSelection({ from: dialogo.desde, to: dialogo.hasta })
                  .extendMarkRange("link")
                  .unsetLink()
                  .run();
                setDialogo(null);
                return;
              }

              if (!esEnlaceSeguro(limpio)) {
                return;
              }

              editor
                .chain()
                .focus()
                .setTextSelection({ from: dialogo.desde, to: dialogo.hasta })
                .extendMarkRange("link")
                .setLink({ href: limpio })
                .run();
              setDialogo(null);
            }}
          >
            <div>
              <label className="field-label" htmlFor="campo-enlace">
                Dirección del enlace
              </label>
              <input
                id="campo-enlace"
                name="href"
                className="field-input"
                value={dialogo.valor}
                placeholder="https://ejemplo.test/libro"
                onChange={(evento) => setDialogo({ ...dialogo, valor: evento.target.value })}
              />
              {dialogo.valor.trim().length > 0 && !esEnlaceSeguro(dialogo.valor.trim()) ? (
                <p className="field-error" role="alert">
                  Ese esquema no se admite. Usa http, https, mailto, tel o una ruta interna.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDialogo(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Guardar enlace
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialogo?.tipo === "nota" ? (
        <Dialog
          abierto
          titulo="Nota al pie"
          descripcion="La nota aparece al pie de la página y se numera sola, en orden de lectura."
          onCerrar={() => setDialogo(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(evento) => {
              evento.preventDefault();

              if (!editor) {
                return;
              }

              const nota = dialogo.valor.trim();

              if (nota.length === 0 || nota.length > MAX_FOOTNOTE_LENGTH) {
                return;
              }

              if (dialogo.noteId) {
                const node = editor.state.doc.nodeAt(dialogo.desde);
                if (node?.type.name !== "footnote" || node.attrs.id !== dialogo.noteId) return;
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(dialogo.desde)
                  .updateEditorialFootnote({ note: nota })
                  .run();
                setDialogo(null);
                return;
              }
              const id = globalThis.crypto.randomUUID();

              editor
                .chain()
                .focus()
                .setTextSelection({ from: dialogo.desde, to: dialogo.hasta })
                .insertContentAt(dialogo.hasta, {
                  type: "footnote",
                  attrs: { id, note: nota },
                })
                .run();
              setDialogo(null);
            }}
          >
            <div>
              <label className="field-label" htmlFor="campo-nota">
                Texto de la nota
              </label>
              <textarea
                id="campo-nota"
                name="note"
                className="field-input min-h-28"
                maxLength={MAX_FOOTNOTE_LENGTH}
                value={dialogo.valor}
                onChange={(evento) => setDialogo({ ...dialogo, valor: evento.target.value })}
              />
              <p className="field-hint">
                {dialogo.valor.length} de {MAX_FOOTNOTE_LENGTH} caracteres.
              </p>
              {dialogo.valor.trim().length > MAX_FOOTNOTE_LENGTH ? (
                <p className="field-error" role="alert">
                  La nota no puede superar los {MAX_FOOTNOTE_LENGTH} caracteres.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDialogo(null)}
              >
                Cancelar
              </button>
              {dialogo.noteId ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (!editor) return;
                    const node = editor.state.doc.nodeAt(dialogo.desde);
                    if (node?.type.name !== "footnote" || node.attrs.id !== dialogo.noteId) return;
                    editor
                      .chain()
                      .focus()
                      .deleteRange({ from: dialogo.desde, to: dialogo.desde + node.nodeSize })
                      .run();
                    setDialogo(null);
                  }}
                >
                  Eliminar nota
                </button>
              ) : null}
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={
                  dialogo.valor.trim().length === 0 ||
                  dialogo.valor.trim().length > MAX_FOOTNOTE_LENGTH
                }
              >
                {dialogo.noteId ? "Guardar nota" : "Insertar nota"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      <div
        className={`panel manuscript-editor ${canEdit ? "" : "manuscript-editor--readonly"}`}
        data-dirty={hasUnsavedWork(machine) ? "true" : "false"}
        data-sync-state={machine.state}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="studio-editor-status">
        <span className="studio-word-stats">
          {formatNumber(currentWords)} palabras <i />
          {formatNumber(liveStats?.characters ?? 0)} caracteres <i />
          {readingMinutes(currentWords)} min de lectura
        </span>
        <p className="text-xs text-ink-muted" role="status" aria-live="polite">
          <span className={`studio-save-dot ${machine.state === "synced" ? "is-saved" : ""}`}>
            <StudioIcon name="check" />
          </span>
          {mensaje}
        </p>

        {canEdit ? (
          <button
            type="button"
            className="studio-save-button"
            aria-label="Guardar manuscrito"
            title="Guardar manuscrito (Ctrl/⌘+S)"
            onClick={() => void sincronizar("manual")}
            disabled={sincronizando}
          >
            {sincronizando ? "Guardando…" : "Guardar"}
          </button>
        ) : null}
        <button
          type="button"
          className="studio-focus-button"
          onClick={() => setFocused((value) => !value)}
          aria-pressed={focused}
          aria-label={focused ? "Salir del modo concentración" : "Ampliar editor"}
          title="Modo concentración · Esc para salir"
        >
          <StudioIcon name="expand" />
        </button>
      </div>

      {!online ? (
        <p className="alert alert-error" role="alert">
          No hay conexión con la red. Puedes seguir escribiendo: el texto se guarda en este equipo y
          se enviará solo al recuperar la conexión.
        </p>
      ) : null}

      {recovered ? (
        <p className="alert alert-success" role="status">
          Se ha recuperado el texto que estaba guardado en este equipo.
        </p>
      ) : null}

      {conflict ? (
        <SectionConflictPanel
          conflict={conflict}
          localContent={
            borradorLocal !== null
              ? (JSON.parse(borradorLocal) as TiptapDocument)
              : editor
                ? (editor.getJSON() as TiptapDocument)
                : null
          }
          onKeepLocal={() => {
            // Si el conflicto viene del borrador local, se carga en el editor
            // antes de enviarlo: el servidor no puede recibir lo que el
            // editor todavía no tiene.
            if (borradorLocal !== null && editor) {
              editor.commands.setContent(JSON.parse(borradorLocal) as TiptapDocument);
              localVersionRef.current += 1;
            }

            setBorradorLocal(null);
            setConflict(null);
            void sincronizar("manual", true);
          }}
          onTakeServer={() => {
            if (editor) {
              try {
                editor.commands.setContent(JSON.parse(conflict.serverContent) as TiptapDocument);
              } catch {
                // Si el contenido del servidor está dañado, se deja el editor
                // como está: el borrador local sigue a salvo.
              }
            }

            versionRef.current = conflict.serverVersion;
            localVersionRef.current = 0;
            setBorradorLocal(null);
            setConflict(null);
            dispatch({ type: "sync-ok", version: conflict.serverVersion });
            void deleteDraft(userId, bookId, sectionId);
          }}
        />
      ) : null}

      {canEdit ? (
        <p className="studio-save-help text-xs leading-relaxed text-ink-muted">
          «{sectionTitle}» se guarda de forma explícita. Además, cada cambio se guarda en este
          equipo al momento y se envía al servidor en cuanto dejas de escribir; el historial de
          versiones conserva cada guardado confirmado.
        </p>
      ) : null}
    </div>
  );
}
