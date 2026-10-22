"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { TiptapDocument } from "@escribiendo/book-schema";
import { countWordsInDocument, MAX_FOOTNOTE_LENGTH } from "@escribiendo/book-schema";
import { esEnlaceSeguro } from "@escribiendo/shared";
import { Dialog } from "@/components/forms/dialog";
import { saveSectionAction } from "@/lib/books/actions";
import { formatNumber } from "@/lib/ui/format";
import {
  applyWritingPreferences,
  readWritingPreferences,
} from "@/components/writing/writing-preferences";
import { deleteDraft, loadDraft, saveDraft, type DraftRecord } from "@/lib/editor/drafts";
import { readSectionScrollPosition, saveSectionScrollPosition } from "@/lib/editor/scroll-position";
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
import { EditorialFootnote } from "@/components/editor/editorial-footnote";
import { EditorialImage } from "@/components/editor/editorial-image";
import { LinkIcon } from "@/components/icons";
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
  key: string;
  label: ReactNode;
  title: string;
  ariaLabel: string;
  pressed?: boolean;
  disabled?: boolean;
  text?: boolean;
  run: () => void;
}

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  canUndo: boolean;
  canRedo: boolean;
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
  /**
   * Diálogo abierto: el enlace o la nota al pie que se está escribiendo.
   *
   * Antes se pedían con `window.prompt`, que bloquea la interfaz y no se
   * puede validar mientras se escribe.
   */
  const [dialogo, setDialogo] = useState<{
    tipo: "enlace" | "nota";
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
      EditorialFootnote,
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
        ...(canEdit ? {} : { "aria-readonly": "true" }),
      },
    },
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
      // servidor. Si el servidor ya está en otra versión, no se descarta
      // ninguna de las dos: se abre el comparador para que la persona
      // decida. Antes el borrador se perdía en silencio y el siguiente
      // autoguardado lo sobrescribía.
      if (borrador.baseVersion !== versionRef.current) {
        setBorradorLocal(borrador.content);
        setConflict({
          serverVersion: versionRef.current,
          serverContent: JSON.stringify(editor.getJSON() as TiptapDocument),
          serverTitle: sectionTitle,
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
  }, [bookId, canEdit, dispatch, editor, sectionId, sectionTitle, userId]);

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

  // --- Posición de lectura -------------------------------------------------
  // Al volver desde la ficha del libro, se recupera el punto donde se estaba
  // leyendo o escribiendo. La posición se guarda al desplazarse y al salir de
  // la página; el enlace «Volver al libro» también la guarda antes de navegar.
  useEffect(() => {
    if (!editor) {
      return;
    }

    let listo = false;
    let scrollFrame: number | null = null;
    let restoreFrame: number | null = null;

    const guardar = (): void => {
      if (listo) {
        saveSectionScrollPosition(bookId, sectionId);
      }
    };

    const alDesplazar = (): void => {
      if (!listo || scrollFrame !== null) {
        return;
      }

      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        guardar();
      });
    };

    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === "hidden") {
        guardar();
      }
    };

    const posicion = readSectionScrollPosition(bookId, sectionId);

    // Dos frames: el primero deja montar el contenido y el segundo permite
    // medir la altura real del documento antes de desplazarse.
    restoreFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => {
        if (posicion !== null) {
          // Sin animación: volver al punto de lectura no debe recorrer la
          // página desde el principio delante de la persona.
          window.scrollTo({ top: posicion, behavior: "instant" });
        }

        listo = true;
      });
    });

    window.addEventListener("scroll", alDesplazar, { passive: true });
    window.addEventListener("pagehide", guardar);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      if (scrollFrame !== null) {
        window.cancelAnimationFrame(scrollFrame);
      }

      if (restoreFrame !== null) {
        window.cancelAnimationFrame(restoreFrame);
      }

      window.removeEventListener("scroll", alDesplazar);
      window.removeEventListener("pagehide", guardar);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      guardar();
    };
  }, [bookId, editor, sectionId]);

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

  const editorActual = editor;

  const toolbarState = useEditorState({
    editor: editorActual,
    selector: ({ editor: actual }): ToolbarState | null => {
      if (!actual) {
        return null;
      }

      return {
        bold: actual.isActive("bold"),
        italic: actual.isActive("italic"),
        underline: actual.isActive("underline"),
        strike: actual.isActive("strike"),
        link: actual.isActive("link"),
        heading1: actual.isActive("heading", { level: 1 }),
        heading2: actual.isActive("heading", { level: 2 }),
        heading3: actual.isActive("heading", { level: 3 }),
        blockquote: actual.isActive("blockquote"),
        bulletList: actual.isActive("bulletList"),
        orderedList: actual.isActive("orderedList"),
        canUndo: actual.can().undo(),
        canRedo: actual.can().redo(),
      };
    },
  });

  const currentWords = editorActual
    ? countWordsInDocument(editorActual.getJSON() as TiptapDocument)
    : wordCount;

  const blockValue = toolbarState?.heading1
    ? "h1"
    : toolbarState?.heading2
      ? "h2"
      : toolbarState?.heading3
        ? "h3"
        : toolbarState?.blockquote
          ? "blockquote"
          : "p";

  const aplicarBloque = (valor: string): void => {
    if (!editorActual) {
      return;
    }

    if (valor === "h1") {
      editorActual.chain().focus().unsetBlockquote().setHeading({ level: 1 }).run();
      return;
    }

    if (valor === "h2") {
      editorActual.chain().focus().unsetBlockquote().setHeading({ level: 2 }).run();
      return;
    }

    if (valor === "h3") {
      editorActual.chain().focus().unsetBlockquote().setHeading({ level: 3 }).run();
      return;
    }

    if (valor === "blockquote") {
      editorActual.chain().focus().setParagraph().setBlockquote().run();
      return;
    }

    editorActual.chain().focus().unsetBlockquote().setParagraph().run();
  };

  const botonesTexto: ToolbarButton[] = editorActual
    ? [
        {
          key: "bold",
          label: <span className="font-bold">B</span>,
          title: "Negrita (Ctrl/Cmd+B)",
          ariaLabel: "Negrita",
          pressed: toolbarState?.bold ?? false,
          run: () => editorActual.chain().focus().toggleBold().run(),
        },
        {
          key: "italic",
          label: <span className="italic">I</span>,
          title: "Cursiva (Ctrl/Cmd+I)",
          ariaLabel: "Cursiva",
          pressed: toolbarState?.italic ?? false,
          run: () => editorActual.chain().focus().toggleItalic().run(),
        },
        {
          key: "underline",
          label: <span className="underline">U</span>,
          title: "Subrayado (Ctrl/Cmd+U)",
          ariaLabel: "Subrayado",
          pressed: toolbarState?.underline ?? false,
          run: () => editorActual.chain().focus().toggleUnderline().run(),
        },
        {
          key: "strike",
          label: <span className="line-through">S</span>,
          title: "Tachado (Ctrl/Cmd+Shift+X)",
          ariaLabel: "Tachado",
          pressed: toolbarState?.strike ?? false,
          run: () => editorActual.chain().focus().toggleStrike().run(),
        },
        {
          key: "link",
          label: <LinkIcon />,
          title: "Enlace",
          ariaLabel: "Enlace",
          pressed: toolbarState?.link ?? false,
          run: () => {
            const anterior = editorActual.getAttributes("link").href;

            setDialogo({
              tipo: "enlace",
              valor: typeof anterior === "string" ? anterior : "",
              desde: editorActual.state.selection.from,
              hasta: editorActual.state.selection.to,
            });
          },
        },
        {
          key: "clear",
          label: "Limpiar",
          title: "Limpiar formato",
          ariaLabel: "Limpiar formato",
          text: true,
          run: () => editorActual.chain().focus().unsetAllMarks().clearNodes().run(),
        },
      ]
    : [];

  const botonesEstructura: ToolbarButton[] = editorActual
    ? [
        {
          key: "bulletList",
          label: (
            <span aria-hidden="true" className="font-serif text-base leading-none">
              •
            </span>
          ),
          title: "Lista de viñetas",
          ariaLabel: "Lista de viñetas",
          pressed: toolbarState?.bulletList ?? false,
          run: () => editorActual.chain().focus().toggleBulletList().run(),
        },
        {
          key: "orderedList",
          label: (
            <span aria-hidden="true" className="text-xs font-semibold tabular-nums">
              1.
            </span>
          ),
          title: "Lista numerada",
          ariaLabel: "Lista numerada",
          pressed: toolbarState?.orderedList ?? false,
          run: () => editorActual.chain().focus().toggleOrderedList().run(),
        },
        {
          key: "separator",
          label: (
            <span aria-hidden="true" className="font-serif text-base leading-none">
              —
            </span>
          ),
          title: "Separador de escena",
          ariaLabel: "Separador de escena",
          run: () => editorActual.chain().focus().setHorizontalRule().run(),
        },
      ]
    : [];

  const botonesInsertar: ToolbarButton[] = editorActual
    ? [
        {
          key: "footnote",
          label: (
            <span aria-hidden="true" className="font-serif text-base leading-none">
              †
            </span>
          ),
          title: "Nota al pie",
          ariaLabel: "Nota al pie",
          run: () => {
            setDialogo({
              tipo: "nota",
              valor: "",
              desde: editorActual.state.selection.from,
              hasta: editorActual.state.selection.to,
            });
          },
        },
      ]
    : [];

  const botonesHistorial: ToolbarButton[] = editorActual
    ? [
        {
          key: "undo",
          label: <span aria-hidden="true">↶</span>,
          title: "Deshacer (Ctrl/Cmd+Z)",
          ariaLabel: "Deshacer",
          disabled: !(toolbarState?.canUndo ?? false),
          run: () => editorActual.chain().focus().undo().run(),
        },
        {
          key: "redo",
          label: <span aria-hidden="true">↷</span>,
          title: "Rehacer (Ctrl/Cmd+Shift+Z)",
          ariaLabel: "Rehacer",
          disabled: !(toolbarState?.canRedo ?? false),
          run: () => editorActual.chain().focus().redo().run(),
        },
      ]
    : [];

  const renderBoton = (boton: ToolbarButton) => (
    <button
      key={boton.key}
      type="button"
      title={boton.title}
      aria-label={boton.ariaLabel}
      aria-pressed={boton.pressed}
      disabled={boton.disabled}
      onClick={boton.run}
      className={`toolbar-button${boton.text ? " toolbar-button--text" : ""}`}
    >
      {boton.label}
    </button>
  );

  const mensaje = statusMessage(machine);
  const sincronizando = machine.state === "syncing";

  return (
    <div className="space-y-4">
      {canEdit && editorActual ? (
        <div className="editor-toolbar panel">
          <p className="meta-label">Formato</p>
          <div
            className="editor-toolbar__controls"
            role="toolbar"
            aria-label="Formato"
            aria-orientation="horizontal"
          >
            <div className="editor-toolbar__group" role="group" aria-label="Estilo de texto">
              {botonesTexto.map(renderBoton)}
            </div>
            <span className="editor-toolbar__divider" aria-hidden="true" />
            <div className="editor-toolbar__group" role="group" aria-label="Estilo de párrafo">
              <div className="editor-toolbar__select">
                <label className="sr-only" htmlFor={`section-block-type-${sectionId}`}>
                  Tipo de bloque
                </label>
                <select
                  id={`section-block-type-${sectionId}`}
                  value={blockValue}
                  onChange={(event) => aplicarBloque(event.target.value)}
                >
                  <option value="p">Párrafo</option>
                  <option value="h1">Título 1</option>
                  <option value="h2">Título 2</option>
                  <option value="h3">Título 3</option>
                  <option value="blockquote">Cita</option>
                </select>
              </div>
            </div>
            <span className="editor-toolbar__divider" aria-hidden="true" />
            <div className="editor-toolbar__group" role="group" aria-label="Listas y estructura">
              {botonesEstructura.map(renderBoton)}
            </div>
            <span className="editor-toolbar__divider" aria-hidden="true" />
            <div className="editor-toolbar__group" role="group" aria-label="Insertar">
              {botonesInsertar.map(renderBoton)}
            </div>
            <div
              className="editor-toolbar__group editor-toolbar__group--history"
              role="group"
              aria-label="Historial"
            >
              {botonesHistorial.map(renderBoton)}
            </div>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="space-y-2">
          <p className="meta-label">Imágenes del libro</p>
          <SectionImageControls
            editor={editorActual}
            bookId={bookId}
            assets={assets}
            onAssetRegistered={(asset) => {
              setAssets((current) =>
                current.some((item) => item.id === asset.id) ? current : [...current, asset],
              );
            }}
          />
        </div>
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
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={
                  dialogo.valor.trim().length === 0 ||
                  dialogo.valor.trim().length > MAX_FOOTNOTE_LENGTH
                }
              >
                Insertar nota
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
        <p className="text-xs leading-relaxed text-ink-muted">
          «{sectionTitle}» se guarda de forma explícita. Además, cada cambio se guarda en este
          equipo al momento y se envía al servidor en cuanto dejas de escribir; el historial de
          versiones conserva cada guardado confirmado.
        </p>
      ) : null}
    </div>
  );
}
