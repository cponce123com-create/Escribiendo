"use client";

import { useActionState, useRef, useState } from "react";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { initialLibraryActionState } from "@/lib/books/action-state";
import {
  deleteBookCoverAction,
  registerBookCoverAction,
  updateBookCoverCropAction,
} from "@/lib/books/cover-actions";
import {
  DEFAULT_CROP,
  coverObjectPosition,
  type BookCoverSummary,
  type CoverCrop,
} from "@/lib/books/cover-shared";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const RECOMMENDED_RATIO = 1 / 1.6;

type CoverStatus = "optimal" | "acceptable" | "insufficient";

interface CoverManagerProps {
  bookId: string;
  bookTitle: string;
  initialCover: BookCoverSummary | null;
}

interface CloudinarySignature {
  apiKey: string;
  uploadUrl: string;
  signature: string;
  params: {
    timestamp: string;
    folder: string;
    allowed_formats: string;
    unique_filename: string;
  };
}

interface CloudinaryUpload {
  secure_url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  original_filename?: string;
}

function validationMessage(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Usa una imagen JPG, PNG o WebP.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "La portada supera los 15 MB permitidos.";
  }
  return null;
}

function quality(
  width: number | null,
  height: number | null,
): { status: CoverStatus; label: string; detail: string } {
  if (!width || !height) {
    return {
      status: "insufficient",
      label: "Insuficiente",
      detail: "No se pudieron leer sus dimensiones.",
    };
  }
  const ratio = width / height;
  const ratioDistance = Math.abs(ratio - RECOMMENDED_RATIO);
  if (width >= 1600 && height >= 2560 && ratioDistance <= 0.03) {
    return {
      status: "optimal",
      label: "Óptima",
      detail: "Cumple la recomendación para libro electrónico.",
    };
  }
  if (width >= 1000 && height >= 1600 && ratioDistance <= 0.08) {
    return {
      status: "acceptable",
      label: "Aceptable",
      detail: "Puede utilizarse, aunque conviene mejorar la resolución.",
    };
  }
  return {
    status: "insufficient",
    label: "Insuficiente",
    detail: "Recomendamos una imagen vertical de 1600 × 2560 px.",
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function CoverManager({ bookId, bookTitle, initialCover }: CoverManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<BookCoverSummary | null>(initialCover);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CoverCrop>(initialCover?.crop ?? DEFAULT_CROP);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, cropAction] = useActionState(
    async (state: typeof initialLibraryActionState, formData: FormData) => {
      const result = await updateBookCoverCropAction(state, formData);
      if (result.status === "success") {
        setMessage(result.message ?? "Encuadre actualizado.");
        setError(null);
      } else {
        setError(result.message ?? "No se pudo actualizar el encuadre.");
      }
      return result;
    },
    initialLibraryActionState,
  );
  const [, deleteAction] = useActionState(
    async (state: typeof initialLibraryActionState, formData: FormData) => {
      const result = await deleteBookCoverAction(state, formData);
      if (result.status === "success") {
        setCover(null);
        setPreview(null);
        setCrop(DEFAULT_CROP);
        setMessage(result.message ?? "Portada eliminada.");
        setError(null);
      } else {
        setError(result.message ?? "No se pudo eliminar la portada.");
      }
      return result;
    },
    initialLibraryActionState,
  );

  const displayUrl = preview ?? cover?.url ?? null;
  const displayQuality = cover ? quality(cover.width, cover.height) : null;

  const upload = async (file: File): Promise<void> => {
    const validation = validationMessage(file);
    if (validation) {
      setError(validation);
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    try {
      const signatureResponse = await fetch("/api/cloudinary/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "cover", bookId }),
      });
      const signature = await readJson<CloudinarySignature & { error?: string }>(signatureResponse);
      if (!signatureResponse.ok || !signature) {
        setError(signature?.error ?? "No se ha podido preparar la subida de la portada.");
        return;
      }

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signature.apiKey);
      form.append("timestamp", signature.params.timestamp);
      form.append("folder", signature.params.folder);
      form.append("allowed_formats", signature.params.allowed_formats);
      form.append("unique_filename", signature.params.unique_filename);
      form.append("signature", signature.signature);
      const uploadResponse = await fetch(signature.uploadUrl, { method: "POST", body: form });
      const uploaded = await readJson<CloudinaryUpload & { error?: { message?: string } }>(
        uploadResponse,
      );
      if (!uploadResponse.ok || !uploaded?.secure_url) {
        setError(uploaded?.error?.message ?? "Cloudinary no ha aceptado la portada.");
        return;
      }

      const registered = await registerBookCoverAction({
        bookId,
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        format: uploaded.format,
        width: uploaded.width,
        height: uploaded.height,
        bytes: uploaded.bytes,
        ...(uploaded.original_filename ? { originalFilename: uploaded.original_filename } : {}),
      });
      if (registered.status === "error") {
        setError(registered.message ?? "No se pudo guardar la portada.");
        return;
      }
      setCover({
        id: uploaded.public_id,
        assetId: uploaded.public_id,
        url: uploaded.secure_url,
        format: uploaded.format,
        width: uploaded.width,
        height: uploaded.height,
        bytes: uploaded.bytes,
        originalFilename: uploaded.original_filename ?? file.name,
        createdAt: new Date().toISOString(),
        crop: DEFAULT_CROP,
      });
      setCrop(DEFAULT_CROP);
      setMessage("Portada guardada. Puedes ajustar su encuadre.");
    } catch {
      setError("No se ha podido subir la portada. Comprueba la conexión e inténtalo de nuevo.");
    } finally {
      URL.revokeObjectURL(localPreview);
      setUploading(false);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  };

  return (
    <section className="panel p-6 sm:p-7" aria-labelledby="cover-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="meta-label">Portada del libro</p>
          <h2 id="cover-title" className="mt-1.5 font-serif text-2xl text-ink">
            Una cubierta que prepare la lectura
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Para obtener una portada nítida recomendamos una imagen vertical de 1600 × 2560 píxeles,
            en sRGB y con proporción 1:1,6.
          </p>
        </div>
        {displayQuality ? (
          <span className={`cover-quality cover-quality-${displayQuality.status}`}>
            {displayQuality.label}
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)]">
        <div
          className={`cover-dropzone ${dragging ? "cover-dropzone-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {displayUrl ? (
            <div
              className="cover-preview"
              aria-label={`Vista previa de la portada de ${bookTitle}`}
            >
              {/* Cloudinary entrega la imagen ya optimizada; no necesita otra transformación. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt={`Portada de ${bookTitle}`}
                className="cover-preview-image"
                style={{
                  objectPosition: coverObjectPosition(crop),
                  transform: `scale(${crop.zoom})`,
                }}
              />
            </div>
          ) : (
            <div className="text-center">
              <p className="font-serif text-lg text-ink">Sin portada</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Arrastra una imagen aquí
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-4"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Subiendo…" : cover ? "Reemplazar portada" : "Subir portada"}
          </button>
        </div>

        <div className="space-y-5">
          {cover ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="stat-card">
                  <p className="meta-label">Dimensiones</p>
                  <p className="mt-2 text-sm text-ink">
                    {cover.width ?? "—"} × {cover.height ?? "—"} px
                  </p>
                </div>
                <div className="stat-card">
                  <p className="meta-label">Formato</p>
                  <p className="mt-2 text-sm uppercase text-ink">{cover.format}</p>
                </div>
                <div className="stat-card">
                  <p className="meta-label">Diagnóstico</p>
                  <p className="mt-2 text-sm text-ink">{displayQuality?.detail}</p>
                </div>
              </div>
              <form action={cropAction} className="space-y-4 rounded border border-line p-4">
                <input type="hidden" name="bookId" value={bookId} />
                <input type="hidden" name="x" value={crop.x} />
                <input type="hidden" name="y" value={crop.y} />
                <input type="hidden" name="zoom" value={crop.zoom} />
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-ink">Zoom</span>
                    <span className="text-ink-muted">{crop.zoom.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={crop.zoom}
                    onChange={(event) =>
                      setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))
                    }
                    className="mt-2 w-full"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-ink">
                    Encuadre horizontal
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={crop.x}
                      onChange={(event) =>
                        setCrop((current) => ({ ...current, x: Number(event.target.value) }))
                      }
                      className="mt-2 w-full"
                    />
                  </label>
                  <label className="text-sm text-ink">
                    Encuadre vertical
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={crop.y}
                      onChange={(event) =>
                        setCrop((current) => ({ ...current, y: Number(event.target.value) }))
                      }
                      className="mt-2 w-full"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Guardar encuadre
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCrop(DEFAULT_CROP)}
                  >
                    Restaurar imagen original
                  </button>
                </div>
              </form>
              <form action={deleteAction} className="flex justify-end">
                <input type="hidden" name="bookId" value={bookId} />
                <ConfirmButton
                  label="Eliminar portada"
                  confirmLabel="Sí, eliminar portada"
                  description={`Eliminar la portada de ${bookTitle}`}
                  className="btn btn-ghost btn-sm text-danger hover:bg-danger/10"
                />
              </form>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-ink-muted">
              Todavía no hay una portada definitiva. Puedes subir JPG, PNG o WebP de hasta 15 MB.
            </p>
          )}
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-success" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
