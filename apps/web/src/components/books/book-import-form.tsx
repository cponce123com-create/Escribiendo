"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { analyzeBookImportAction, importBookAction } from "@/lib/books/import-actions";
import { initialLibraryActionState } from "@/lib/books/action-state";
import {
  IMPORT_SECTION_TYPES,
  type ImportSectionChoice,
  type ImportPreview,
  type ImportSectionType,
} from "@/lib/books/import-types";
export function BookImportForm() {
  const [state, formAction] = useActionState(importBookAction, initialLibraryActionState);
  const [busy, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<ImportSectionChoice[]>([]);
  const [error, setError] = useState("");
  function analyze() {
    if (!form.current) return;
    const data = new FormData(form.current);
    startTransition(async () => {
      try {
        const result = await analyzeBookImportAction(data);
        if (result.preview) {
          setPreview(result.preview);
          setChoices(
            result.preview.sections.map((section) => ({
              index: section.index,
              title: section.title,
              type: section.type,
              include: true,
            })),
          );
          setError("");
        } else {
          setPreview(null);
          setChoices([]);
          setError(result.message ?? "No se pudo analizar el archivo.");
        }
      } catch {
        setPreview(null);
        setError("No se pudo analizar el archivo. Vuelve a intentarlo.");
      }
    });
  }
  function change(index: number, patch: Partial<ImportSectionChoice>) {
    setChoices((previous) =>
      previous.map((choice) => (choice.index === index ? { ...choice, ...patch } : choice)),
    );
  }
  return (
    <form ref={form} action={formAction} encType="multipart/form-data" className="space-y-6">
      <FormMessage state={state} />
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <label className="field-label" htmlFor="import-file">
          Archivo del libro
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".epub,.docx,.pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
          required
          disabled={busy}
          className="field-input"
          onChange={() => {
            setPreview(null);
            setChoices([]);
            setError("");
          }}
          aria-describedby="import-file-hint"
        />
        <p className="field-hint" id="import-file-hint">
          EPUB, DOCX o PDF · máximo 15 MB. Primero se analiza; el libro se crea solo cuando
          confirmas. Se importa el texto y formato básico, no una copia idéntica del diseño.
        </p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={analyze} disabled={busy}>
        {busy ? "Analizando estructura…" : "Analizar archivo"}
      </button>
      {busy ? (
        <p role="status">
          Leyendo el archivo y detectando secciones. Todavía no se ha creado ningún libro.
        </p>
      ) : null}
      {preview ? (
        <div key={preview.fingerprint} className="space-y-5">
          <h2 className="font-serif text-xl">Revisar importación</h2>
          <p className="text-sm" role="status">
            {preview.sections.length} secciones detectadas ·{" "}
            {preview.sections.reduce((sum, section) => sum + section.words, 0).toLocaleString("es")}{" "}
            palabras aproximadas · {preview.format.toUpperCase()}
          </p>
          <ul className="space-y-2">
            {preview.warnings.map((warning, index) => (
              <li key={index} className="alert text-sm">
                {warning}
              </li>
            ))}
          </ul>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="title"
              label="Título del libro"
              defaultValue={preview.title}
              required
              error={state.fieldErrors?.title}
            />
            <TextField
              name="authorName"
              label="Autoría"
              defaultValue={preview.authorName}
              required
              error={state.fieldErrors?.authorName}
            />
          </div>
          <input type="hidden" name="fingerprint" value={preview.fingerprint} />
          <input type="hidden" name="importRequestId" value={preview.requestId} />
          <input type="hidden" name="sectionChoices" value={JSON.stringify(choices)} />
          <ol
            className="max-h-[36rem] space-y-4 overflow-y-auto p-1"
            aria-label="Secciones detectadas"
          >
            {preview.sections.map((section) => {
              const choice = choices[section.index];
              if (!choice) return null;
              return (
                <li key={section.index} className="panel space-y-3 p-4">
                  {section.detection ? (
                    <p className="text-xs text-ink-soft">
                      Detección {section.detection.confidence} ({section.detection.score}/100)
                      {section.detection.signals.length
                        ? ` · ${section.detection.signals.join(" · ")}`
                        : " · Sin señales estructurales; revisa este límite"}
                    </p>
                  ) : null}
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={choice.include}
                      onChange={(event) => change(section.index, { include: event.target.checked })}
                    />
                    Importar sección {section.index + 1} · {section.words} palabras
                  </label>
                  <label className="block text-sm" htmlFor={`section-title-${section.index}`}>
                    Título de sección {section.index + 1}
                    <input
                      id={`section-title-${section.index}`}
                      className="field-input"
                      value={choice.title}
                      maxLength={300}
                      required={choice.include}
                      disabled={!choice.include}
                      onChange={(event) => change(section.index, { title: event.target.value })}
                    />
                  </label>
                  <div>
                    <label className="block text-sm" htmlFor={`section-type-${section.index}`}>
                      Tipo de sección {section.index + 1}
                    </label>
                    <select
                      id={`section-type-${section.index}`}
                      className="field-input"
                      value={choice.type}
                      disabled={!choice.include}
                      onChange={(event) =>
                        change(section.index, { type: event.target.value as ImportSectionType })
                      }
                    >
                      {Object.entries(IMPORT_SECTION_TYPES).map(([type, label]) => (
                        <option key={type} value={type}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer underline">Ver inicio del contenido</summary>
                    <p className="mt-2 whitespace-pre-wrap text-ink-soft">
                      {section.excerpt || "Esta sección contiene solo un título."}
                    </p>
                  </details>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-ink-muted">
            Desmarca únicamente las secciones que quieras omitir. Un índice o página legal
            originales se conservan en modo manual; podrás cambiarlos por plantillas después. Los
            PDF escaneados necesitan OCR.
          </p>
          <SubmitButton
            label="Confirmar e importar libro"
            pendingLabel="Guardando libro…"
            disabled={busy || !choices.some((choice) => choice.include)}
          />
        </div>
      ) : null}
    </form>
  );
}
