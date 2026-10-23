"use client";
import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import type { PreviewResult } from "@/lib/layout/preview";
import Link from "next/link";
import { LEGAL_FIELD_LABELS } from "@/lib/editorial/template-settings";
import { useRouter } from "next/navigation";
import {
  LEGAL_TEMPLATE_CATALOG,
  CREATIVE_COMMONS_LICENSES,
  licenseText,
} from "@escribiendo/templates";
import type { legalGalleryPreview } from "@/lib/editorial/gallery-preview";
import { legalGalleryPreview as requestPreview } from "@/lib/editorial/gallery-preview";
import { updateLegalTemplateAction } from "@/lib/editorial/template-actions";
import { initialActionState } from "@/lib/action-state";
import { Dialog } from "@/components/forms/dialog";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { MatterSheet } from "./matter-sheet";
import { LegalClausesField } from "./legal-clauses-field";

type PreviewData = {
  preview: PreviewResult | null;
  warnings: NonNullable<Awaited<ReturnType<typeof legalGalleryPreview>>>["warnings"];
} | null;
export function LegalTemplateGallery({
  bookId,
  cards,
  selected,
  clauses: initialClauses,
  license: initialLicense,
  country,
  publisher,
  canManage,
  sections,
  fields: initialFields,
  mode,
  sectionId,
}: {
  bookId: string;
  cards: Array<{
    preview: PreviewResult | null;
    warnings: NonNullable<PreviewData>["warnings"];
    slug: string;
  }>;
  selected: string;
  clauses: string;
  license: string;
  country: string;
  publisher: boolean;
  canManage: boolean;
  sections: Array<{ id: string; title: string }>;
  fields: Record<string, string | number | null>;
  mode: string;
  sectionId: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [slug, setSlug] = useState(selected);
  const [open, setOpen] = useState(false);
  const closeDialog = useCallback(() => setOpen(false), []);
  const [clauses, setClauses] = useState(initialClauses);
  const [license, setLicense] = useState(initialLicense);
  const [current, setCurrent] = useState<PreviewData>(
    cards.find((card) => card.slug === selected) ?? null,
  );
  const [previewError, setPreviewError] = useState("");
  const [busy, startTransition] = useTransition();
  const [state, action] = useActionState(updateLegalTemplateAction, initialActionState);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(
      () =>
        startTransition(async () => {
          try {
            const next = await requestPreview(bookId, slug, clauses, license, fields);
            if (active) {
              setCurrent(next);
              setPreviewError("");
            }
          } catch {
            if (active)
              setPreviewError(
                "Revisa las cláusulas y la licencia antes de actualizar la vista previa.",
              );
          }
        }),
      300,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [bookId, slug, clauses, license, open, fields]);
  const recommended =
    country === "PE" || country.toLocaleLowerCase("es") === "perú"
      ? publisher
        ? "copyright-peru-publisher"
        : "copyright-peru-author"
      : "copyright-international";
  function choose(value: string) {
    setSlug(value);
    setCurrent(cards.find((card) => card.slug === value) ?? null);
    setOpen(true);
  }
  return (
    <section className="space-y-5" aria-labelledby="legal-title">
      <h2 id="legal-title" className="scroll-mt-28 font-serif text-2xl">
        Página legal
      </h2>
      <p className="alert" role="note">
        Plantillas informativas; no constituyen asesoría legal. Revisa los datos y adapta el texto
        antes de publicar.
      </p>
      <fieldset disabled={!canManage}>
        <legend className="sr-only">Plantilla de página legal</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEGAL_TEMPLATE_CATALOG.map((item) => (
            <label
              key={item.slug}
              className="panel cursor-pointer space-y-3 p-4 focus-within:ring-2 focus-within:ring-brand"
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="legal-gallery"
                  value={item.slug}
                  checked={slug === item.slug}
                  onChange={() => {
                    setSlug(item.slug);
                    setCurrent(cards.find((card) => card.slug === item.slug) ?? null);
                  }}
                />
                <strong>{item.name}</strong>
              </div>
              {recommended === item.slug ? (
                <span className="text-xs text-brand">Recomendada</span>
              ) : null}
              <MatterSheet
                mini
                preview={cards.find((card) => card.slug === item.slug)?.preview ?? null}
              />
              <p className="text-sm text-ink-soft">{item.description}</p>
              <p className="text-xs text-ink-muted">
                {item.audience} · {item.country} · Español
              </p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => choose(item.slug)}
              >
                Ver plantilla
              </button>
            </label>
          ))}
        </div>
      </fieldset>
      <form action={action} className="panel space-y-3 p-4">
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="template" value={slug} />
        <label className="block text-sm">
          Contenido de la página legal
          <select defaultValue={mode} name="mode" className="field-input" disabled={!canManage}>
            <option value="TEMPLATE">Usar plantilla</option>
            <option value="DISABLED">Sin página legal</option>
            <option value="MANUAL">Página legal propia</option>
          </select>
        </label>
        <label className="block text-sm">
          Sección de texto libre para página propia (crea una sección «Personalizada» en el
          manuscrito)
          <select
            defaultValue={sectionId}
            name="sectionId"
            className="field-input"
            disabled={!canManage}
          >
            <option value="">Elige una sección</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="customClauses" value={clauses} />
        <input type="hidden" name="license" value={license} />
        <input type="hidden" name="legalFields" value={JSON.stringify(fields)} />
        <FormMessage state={state} />
        <SubmitButton label="Guardar modo" pendingLabel="Guardando…" disabled={!canManage} />
      </form>
      <Dialog
        abierto={open}
        titulo={LEGAL_TEMPLATE_CATALOG.find((item) => item.slug === slug)?.name ?? "Página legal"}
        onCerrar={closeDialog}
      >
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <MatterSheet preview={current?.preview ?? null} />
          {busy ? <p role="status">Actualizando hoja…</p> : null}
          {previewError ? (
            <p className="alert alert-error" role="status">
              {previewError}
            </p>
          ) : null}
          <ul className="space-y-2">
            {current?.warnings.map((warning) => (
              <li key={warning.code} className="alert alert-error text-sm">
                <Link
                  href={
                    warning.field === "title" || warning.field === "author"
                      ? `/books/${bookId}/edit#field-${warning.field === "author" ? "authorName" : "title"}`
                      : `#legal-${warning.field === "editionNumber" ? "editionLabel" : (warning.field ?? "datos")}`
                  }
                >
                  {warning.message} Completar datos →
                </Link>
              </li>
            ))}
          </ul>
          <form action={action} className="space-y-4">
            <input type="hidden" name="bookId" value={bookId} />
            <input type="hidden" name="template" value={slug} />
            <input type="hidden" name="mode" value="TEMPLATE" />
            {slug === "copyright-creative-commons" ? (
              <label className="block text-sm">
                Licencia
                <select
                  name="license"
                  className="field-input"
                  value={license}
                  onChange={(event) => setLicense(event.target.value)}
                >
                  <option value="">Elige una licencia</option>
                  {CREATIVE_COMMONS_LICENSES.map((id) => (
                    <option key={id} value={id}>
                      {licenseText(id).label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="license" value="" />
            )}
            <details className="space-y-3" open>
              <summary>Datos de esta página legal</summary>
              <p className="text-xs text-ink-muted">
                Se guardan para esta edición. Deja vacíos los datos que aún no tienes.
              </p>
              {Object.entries(LEGAL_FIELD_LABELS).map(([key, label]) => (
                <label key={key} id={`legal-${key}`} className="block text-sm">
                  {label}
                  <input
                    className="field-input"
                    type={key === "copyrightYear" || key === "printRun" ? "number" : "text"}
                    value={fields[key] ?? ""}
                    onChange={(event) =>
                      setFields((previous) => ({
                        ...previous,
                        [key]:
                          key === "copyrightYear" || key === "printRun"
                            ? event.target.value
                              ? Number(event.target.value)
                              : null
                            : event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </details>
            <LegalClausesField value={clauses} onChange={setClauses} />
            <input type="hidden" name="legalFields" value={JSON.stringify(fields)} />
            <FormMessage state={state} />
            <SubmitButton
              label="Usar esta plantilla"
              pendingLabel="Guardando…"
              disabled={!canManage}
            />
          </form>
        </div>
      </Dialog>
    </section>
  );
}
