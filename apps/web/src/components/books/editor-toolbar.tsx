"use client";

import { StudioIcon } from "./studio-icon";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { blockStyleValue, isApplePlatform, type BlockStyleValue } from "./editor-toolbar-state";

interface EditorToolbarProps {
  editor: Editor | null;
  onLink: () => void;
  onFootnote: () => void;
  onMarginNote: () => void;
  onGlossaryTerm: () => void;
  onImage: () => void;
  onProofread: () => void;
}

interface EditorToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  headingLevel: number | null;
  canUndo: boolean;
  canRedo: boolean;
}

const ESTADO_VACIO: EditorToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  link: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
  headingLevel: null,
  canUndo: false,
  canRedo: false,
};

function Icono({
  tipo,
}: {
  tipo: "bullet" | "ordered" | "quote" | "link" | "footnote" | "margin" | "rule";
}) {
  const paths: Record<typeof tipo, string> = {
    bullet: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
    ordered: "M10 6h10M10 12h10M10 18h10M4 5h1v3M3 8h3M3 12h2a1 1 0 0 1 0 2H3l2 2H3M4 18h2v3H3",
    quote:
      "M10 11H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5v7Zm11 0h-5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5v7ZM5 11v2a3 3 0 0 1-3 3m14-5v2a3 3 0 0 1-3 3",
    link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    footnote: "M4 4h7v7H4zM15 4v7m-3.5-3.5h7M13 20l4-8 4 8m-6.5-2h5",
    margin: "M4 4h10v16H4zM17 7h3M17 12h3M17 17h3",
    rule: "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[tipo]} />
    </svg>
  );
}

function plataformaActual(): string {
  return typeof navigator === "undefined" ? "" : navigator.platform;
}

function suscribirPlataforma(): () => void {
  return () => undefined;
}

function ToolbarButton({
  label,
  title,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`editor-toolbar__button${pressed ? " is-active" : ""}`}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({
  editor,
  onLink,
  onFootnote,
  onMarginNote,
  onGlossaryTerm,
  onImage,
  onProofread,
}: EditorToolbarProps) {
  const estado = useEditorState({
    editor,
    selector: ({ editor: instancia }): EditorToolbarState => {
      if (!instancia) {
        return ESTADO_VACIO;
      }

      const headingLevel = instancia.isActive("heading")
        ? Number(instancia.getAttributes("heading").level)
        : null;

      return {
        bold: instancia.isActive("bold"),
        italic: instancia.isActive("italic"),
        underline: instancia.isActive("underline"),
        strike: instancia.isActive("strike"),
        link: instancia.isActive("link"),
        bulletList: instancia.isActive("bulletList"),
        orderedList: instancia.isActive("orderedList"),
        blockquote: instancia.isActive("blockquote"),
        headingLevel,
        canUndo: instancia.can().undo(),
        canRedo: instancia.can().redo(),
      };
    },
  });
  const esApple = isApplePlatform(
    useSyncExternalStore(suscribirPlataforma, plataformaActual, () => ""),
  );

  if (!editor) {
    return null;
  }

  const mod = esApple ? "⌘" : "Ctrl";
  const estilo = blockStyleValue(estado ?? ESTADO_VACIO);
  const elegirEstilo = (valor: BlockStyleValue): void => {
    if (valor === "paragraph") {
      editor.chain().focus().setParagraph().run();
    } else if (valor === "heading2") {
      editor.chain().focus().setHeading({ level: 2 }).run();
    } else if (valor === "heading3") {
      editor.chain().focus().setHeading({ level: 3 }).run();
    }
  };

  return (
    <div className="editor-toolbar-wrap">
      <div className="editor-toolbar" role="toolbar" aria-label="Formato del manuscrito">
        <div className="editor-toolbar__group" role="group" aria-label="Estilo del bloque">
          <label className="sr-only" htmlFor="editor-block-style">
            Estilo del bloque
          </label>
          <select
            id="editor-block-style"
            value={estilo}
            onChange={(event) => elegirEstilo(event.target.value as BlockStyleValue)}
            className="editor-toolbar__select"
          >
            <option value="paragraph">Párrafo</option>
            {estilo === "heading1" ? (
              <option value="heading1" disabled>
                Título 1 (heredado)
              </option>
            ) : null}
            <option value="heading2">Título de sección (H2)</option>
            <option value="heading3">Subtítulo (H3)</option>
          </select>
        </div>

        <div className="editor-toolbar__group" role="group" aria-label="Formato de texto">
          <ToolbarButton
            label="Negrita"
            title={`Negrita (${mod}+B)`}
            pressed={estado?.bold ?? false}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            label="Cursiva"
            title={`Cursiva (${mod}+I)`}
            pressed={estado?.italic ?? false}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            label="Subrayado"
            title={`Subrayado (${mod}+U)`}
            pressed={estado?.underline ?? false}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <u>U</u>
          </ToolbarButton>
          <ToolbarButton
            label="Tachado"
            title={`Tachado (${mod}+Mayús+X)`}
            pressed={estado?.strike ?? false}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <s>S</s>
          </ToolbarButton>
        </div>

        <div className="editor-toolbar__group" role="group" aria-label="Listas y cita">
          <ToolbarButton
            label="Lista con viñetas"
            title={`Lista con viñetas (${mod}+Mayús+8)`}
            pressed={estado?.bulletList ?? false}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <Icono tipo="bullet" />
          </ToolbarButton>
          <ToolbarButton
            label="Lista numerada"
            title={`Lista numerada (${mod}+Mayús+7)`}
            pressed={estado?.orderedList ?? false}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <Icono tipo="ordered" />
          </ToolbarButton>
          <ToolbarButton
            label="Cita"
            title={`Cita (${mod}+Mayús+B)`}
            pressed={estado?.blockquote ?? false}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Icono tipo="quote" />
          </ToolbarButton>
        </div>

        <div className="editor-toolbar__group" role="group" aria-label="Insertar">
          <ToolbarButton
            label="Enlace"
            title="Enlace"
            pressed={estado?.link ?? false}
            onClick={onLink}
          >
            <Icono tipo="link" />
            <span>Enlace</span>
          </ToolbarButton>
          <ToolbarButton label="Imagen" title="Insertar o gestionar imágenes" onClick={onImage}>
            <StudioIcon name="image" />
          </ToolbarButton>
        </div>

        <div className="editor-toolbar__group" role="group" aria-label="Alineación del párrafo">
          <ToolbarButton
            label="Alinear a la izquierda"
            title="Alineación individual pendiente; configura la alineación en Maquetación"
            disabled
          >
            <StudioIcon name="alignLeft" />
          </ToolbarButton>
          <ToolbarButton
            label="Centrar párrafo"
            title="Alineación individual pendiente; configura la alineación en Maquetación"
            disabled
          >
            <StudioIcon name="alignCenter" />
          </ToolbarButton>
        </div>
        <div className="editor-toolbar__group" role="group" aria-label="Historial">
          <ToolbarButton
            label="Deshacer"
            title={`Deshacer (${mod}+Z)`}
            disabled={!estado?.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <span aria-hidden="true">↶</span>
          </ToolbarButton>
          <ToolbarButton
            label="Rehacer"
            title={`Rehacer (${mod}+Mayús+Z)`}
            disabled={!estado?.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <span aria-hidden="true">↷</span>
          </ToolbarButton>
        </div>
        <div className="editor-toolbar__group" role="group" aria-label="Revisión local">
          <ToolbarButton
            label="Corrector local"
            title="Buscar errores frecuentes en español sin enviar el texto fuera de esta página"
            onClick={onProofread}
          >
            <StudioIcon name="check" />
            <span>Revisar</span>
          </ToolbarButton>
        </div>
        <details className="studio-toolbar-more">
          <summary>
            Más <span aria-hidden="true">⌄</span>
          </summary>
          <div>
            <ToolbarButton label="Nota al pie" title="Nota al pie" onClick={onFootnote}>
              <Icono tipo="footnote" />
              <span>Nota al pie</span>
            </ToolbarButton>
            <ToolbarButton
              label="Nota al margen"
              title="Nota en la columna exterior, junto al párrafo"
              onClick={onMarginNote}
            >
              <Icono tipo="margin" />
              <span>Nota al margen</span>
            </ToolbarButton>
            <ToolbarButton
              label="Término de glosario"
              title="Señala el texto seleccionado como término del glosario"
              onClick={onGlossaryTerm}
            >
              <Icono tipo="margin" />
              <span>Término de glosario</span>
            </ToolbarButton>
            <ToolbarButton
              label="Separador"
              title="Separador"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Icono tipo="rule" />
              <span>Separador</span>
            </ToolbarButton>
            <p className="editor-toolbar__help">
              El nombre del capítulo se imprime solo, con el estilo de título de la maqueta: no hace
              falta escribirlo en el texto.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
