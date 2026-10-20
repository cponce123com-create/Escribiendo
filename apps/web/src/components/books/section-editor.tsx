"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { TiptapDocument } from "@escribiendo/book-schema";
import { countWordsInDocument } from "@escribiendo/book-schema";
import { saveSectionAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";
import { formatNumber } from "@/lib/ui/format";

interface SectionEditorProps {
  sectionId: string;
  sectionTitle: string;
  content: TiptapDocument;
  version: number;
  wordCount: number;
  canEdit: boolean;
}

/** Cada cuánto se intenta el guardado automático, en milisegundos. */
const AUTOSAVE_INTERVAL_MS = 60_000;

interface ToolbarButton {
  label: string;
  title: string;
  isActive: () => boolean;
  run: () => void;
}

export function SectionEditor({
  sectionId,
  sectionTitle,
  content,
  version,
  wordCount,
  canEdit,
}: SectionEditorProps) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [currentVersion, setCurrentVersion] = useState(version);

  const versionRef = useRef(version);

  useEffect(() => {
    versionRef.current = currentVersion;
  }, [currentVersion]);

  const editor = useEditor({
    extensions: [StarterKit],
    content,
    // El editor se inicializa en el cliente: sin esta opción, Next.js
    // intentaría renderizarlo en el servidor y la hidratación no coincidiría.
    immediatelyRender: false,
    editable: canEdit,
    onUpdate: () => {
      setDirty(true);
    },
  });

  const persist = useCallback(
    async (intent: "manual" | "autosave") => {
      if (!editor || saving) {
        return;
      }

      const formData = new FormData();
      formData.set("sectionId", sectionId);
      formData.set("version", String(versionRef.current));
      formData.set("content", JSON.stringify(editor.getJSON()));
      formData.set("intent", intent);

      setSaving(true);
      setNotice(null);

      try {
        const result = await saveSectionAction(initialLibraryActionState, formData);

        if (result.status === "error") {
          setNotice({ tone: "error", text: result.message ?? "No se ha podido guardar." });
          return;
        }

        setCurrentVersion((current) => current + 1);
        setDirty(false);
        setNotice({ tone: "ok", text: result.message ?? "Guardado." });
      } catch {
        setNotice({ tone: "error", text: "No se ha podido guardar el manuscrito." });
      } finally {
        setSaving(false);
      }
    },
    [editor, saving, sectionId],
  );

  // Autoguardado limitado: solo cuando hay cambios y como máximo una vez por
  // intervalo. El servidor vuelve a acotar la frecuencia.
  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const timer = window.setInterval(() => {
      if (dirty) {
        void persist("autosave");
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [canEdit, dirty, persist]);

  // Aviso al cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const currentWords = editor
    ? countWordsInDocument(editor.getJSON() as TiptapDocument)
    : wordCount;

  const buttons: ToolbarButton[] = editor
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

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Formato">
          {buttons.map((button) => (
            <button
              key={button.title}
              type="button"
              title={button.title}
              aria-label={button.title}
              aria-pressed={button.isActive()}
              onClick={button.run}
              className={`icon-button ${button.isActive() ? "border-accent text-accent" : ""}`}
            >
              {button.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`panel manuscript-editor ${canEdit ? "" : "manuscript-editor--readonly"}`}
        data-dirty={dirty ? "true" : "false"}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {formatNumber(currentWords)} palabras
          {dirty ? " · cambios sin guardar" : " · todo guardado"}
          {` · versión ${currentVersion}`}
        </p>

        {canEdit ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void persist("manual")}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar manuscrito"}
          </button>
        ) : null}
      </div>

      {notice ? (
        <p
          className={notice.tone === "error" ? "alert alert-error" : "alert alert-success"}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      {canEdit ? (
        <p className="text-xs leading-relaxed text-ink-muted">
          «{sectionTitle}» se guarda de forma explícita. Además, si pasan un minuto sin guardar, se
          guarda una copia automática; el historial de versiones conserva cada guardado.
        </p>
      ) : null}
    </div>
  );
}
