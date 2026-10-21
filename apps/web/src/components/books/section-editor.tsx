"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { TiptapDocument } from "@escribiendo/book-schema";
import { countWordsInDocument } from "@escribiendo/book-schema";
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
import { SectionImageControls } from "@/components/books/section-image-controls";
import { EditorialImage } from "@/components/editor/editorial-image";
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

interface ToolbarButton {
  label: string;
  title: string;
  isActive: () => boolean;
  run: () => void;
}

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
  const [machine, setMachine] = useState<SyncMachine>(() => initialSyncMachine(version));
  const [conflict, setConflict] = useState<SectionConflict | null>(null);
  const [online, setOnline] = useState(true);
  const [recovered, setRecovered] = useState(false);
  const [assets, setAssets] = useState<BookAssetSummary[]>(() => bookAssets);

  const machineRef = useRef(machine);
  const versionRef = useRef(version);
  const localVersionRef = useRef(0);
  /** Número de la petición en curso: descarta respuestas fuera de orden. */
  const requestRef = useRef(0);
  const localTimer = useRef<number | null>(null);
  const syncTimer = useRef<number | null>(null);
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
    ],
    content,
    // El editor se inicializa en el cliente: sin esta opción, Next.js
    // intentaría renderizarlo en el servidor y la hidratación no coincidiría.
    immediatelyRender: false,
    editable: canEdit,
    onUpdate: () => {
      if (!canEdit) {
        return;
      }

      localVersionRef.current += 1;
      dispatch({ type: "edit" });
    },
  });

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
      // servidor. Si el servidor ya está en otra versión, se deja el
      // conflicto para que la persona decida.
      if (borrador.baseVersion !== versionRef.current) {
        return;
      }

      if (borrador.syncState === "synced") {
        await deleteDraft(userId, bookId, sectionId);
        return;
      }

      editor.commands.setContent(JSON.parse(borrador.content) as TiptapDocument);
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
      formData.set("content", JSON.stringify(editorActual.getJSON()));
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
          dispatch({ type: "sync-throttled" });
          return;
        }

        const versionGuardada = resultado.savedVersion ?? versionRef.current;
        versionRef.current = versionGuardada;

        // Si se ha escrito mientras la petición estaba en curso, lo guardado
        // es una versión anterior: el texto nuevo sigue pendiente.
        if (localVersionRef.current !== versionLocalAlEnviar) {
          dispatch({ type: "edit" });
        } else {
          dispatch({ type: "sync-ok", version: versionGuardada });
          await deleteDraft(userId, bookId, sectionId);
        }
      } catch {
        if (peticion !== requestRef.current) {
          return;
        }

        dispatch({ type: "sync-offline" });
      }
    },
    [bookId, canEdit, dispatch, editor, sectionId, userId],
  );

  // --- Programación de las tareas ------------------------------------------

  const programarSincronizacion = useCallback(
    (ms: number) => {
      if (syncTimer.current !== null) {
        window.clearTimeout(syncTimer.current);
      }

      syncTimer.current = window.setTimeout(() => {
        syncTimer.current = null;

        if (shouldSync(machineRef.current)) {
          void sincronizar("autosave");
        }
      }, ms);
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

  // Limpieza de los temporizadores al desmontar.
  useEffect(
    () => () => {
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

  const currentWords = editor
    ? countWordsInDocument(editor.getJSON() as TiptapDocument)
    : wordCount;

  const botones: ToolbarButton[] = editor
    ? [
        {
          label: "N",
          title: "Negrita",
          isActive: () => editor.isActive("bold"),
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          label: "C",
          title: "Cursiva",
          isActive: () => editor.isActive("italic"),
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          label: "S",
          title: "Tachado",
          isActive: () => editor.isActive("strike"),
          run: () => editor.chain().focus().toggleStrike().run(),
        },
        {
          label: "U",
          title: "Subrayado",
          isActive: () => editor.isActive("underline"),
          run: () => editor.chain().focus().toggleUnderline().run(),
        },
        {
          label: "E",
          title: "Enlace",
          isActive: () => editor.isActive("link"),
          run: () => {
            const anterior = editor.getAttributes("link").href;
            const href = window.prompt(
              "Dirección del enlace (vacía para quitarlo)",
              typeof anterior === "string" ? anterior : "https://",
            );

            if (href === null) {
              return;
            }

            const limpio = href.trim();

            if (limpio.length === 0) {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }

            editor.chain().focus().extendMarkRange("link").setLink({ href: limpio }).run();
          },
        },
        {
          label: "H2",
          title: "Título de nivel 2",
          isActive: () => editor.isActive("heading", { level: 2 }),
          run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          label: "H3",
          title: "Título de nivel 3",
          isActive: () => editor.isActive("heading", { level: 3 }),
          run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        },
        {
          label: "•",
          title: "Lista de viñetas",
          isActive: () => editor.isActive("bulletList"),
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          label: "1.",
          title: "Lista numerada",
          isActive: () => editor.isActive("orderedList"),
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          label: "❝",
          title: "Cita",
          isActive: () => editor.isActive("blockquote"),
          run: () => editor.chain().focus().toggleBlockquote().run(),
        },
        {
          label: "—",
          title: "Separador de escena",
          isActive: () => editor.isActive("horizontalRule"),
          run: () => editor.chain().focus().setHorizontalRule().run(),
        },
        {
          label: "↶",
          title: "Deshacer",
          isActive: () => false,
          run: () => editor.chain().focus().undo().run(),
        },
        {
          label: "↷",
          title: "Rehacer",
          isActive: () => false,
          run: () => editor.chain().focus().redo().run(),
        },
      ]
    : [];

  const mensaje = statusMessage(machine);
  const sincronizando = machine.state === "syncing";

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Formato">
          {botones.map((boton) => (
            <button
              key={boton.title}
              type="button"
              title={boton.title}
              aria-label={boton.title}
              aria-pressed={boton.isActive()}
              onClick={boton.run}
              className={`icon-button ${boton.isActive() ? "border-accent text-accent" : ""}`}
            >
              {boton.label}
            </button>
          ))}
        </div>
      ) : null}

      {canEdit ? (
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

      <div
        className={`panel manuscript-editor ${canEdit ? "" : "manuscript-editor--readonly"}`}
        data-dirty={hasUnsavedWork(machine) ? "true" : "false"}
        data-sync-state={machine.state}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted" role="status" aria-live="polite">
          {formatNumber(currentWords)} palabras · {mensaje} · versión {machine.serverVersion}
        </p>

        {canEdit ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void sincronizar("manual")}
            disabled={sincronizando}
          >
            {sincronizando ? "Guardando…" : "Guardar manuscrito"}
          </button>
        ) : null}
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
          localContent={editor ? (editor.getJSON() as TiptapDocument) : null}
          onKeepLocal={() => {
            setConflict(null);
            void sincronizar("manual", true);
          }}
          onTakeServer={() => {
            if (editor) {
              editor.commands.setContent(JSON.parse(conflict.serverContent) as TiptapDocument);
            }

            versionRef.current = conflict.serverVersion;
            localVersionRef.current = 0;
            setConflict(null);
            dispatch({ type: "sync-ok", version: conflict.serverVersion });
            void deleteDraft(userId, bookId, sectionId);
          }}
        />
      ) : null}

      {canEdit ? (
        <p className="text-xs leading-relaxed text-ink-muted">
          «{sectionTitle}» se guarda de forma explícita. Además, cada cambio se guarda en este
          equipo al momento y se envía al servidor en cuanto dejas de escribir; el historial de
          versiones conserva cada guardado confirmado.
        </p>
      ) : null}
    </div>
  );
}
