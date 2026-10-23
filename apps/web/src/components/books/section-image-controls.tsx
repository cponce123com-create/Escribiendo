"use client";

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import type { BookAssetSummary } from "@/lib/books/assets";
import { registerBookAssetAction } from "@/lib/books/asset-actions";
import type { EditorialImageAlignment } from "@/components/editor/editorial-image";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

interface SectionImageControlsProps {
  editor: Editor | null;
  bookId: string;
  assets: readonly BookAssetSummary[];
  onAssetRegistered: (asset: BookAssetSummary) => void;
}

interface SelectedImage {
  alt: string;
  caption: string;
  widthPercent: number;
  alignment: EditorialImageAlignment;
}

interface SignatureResponse {
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

function fileError(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Usa una imagen JPEG, PNG, WebP o AVIF.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "La imagen supera los 15 MB permitidos.";
  }

  return null;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function SectionImageControls({
  editor,
  bookId,
  assets,
  onAssetRegistered,
}: SectionImageControlsProps) {
  const insertInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const selected = useEditorState({
    editor,
    selector: ({ editor: current }): SelectedImage | null => {
      if (!current || !current.isActive("image")) {
        return null;
      }

      const attrs = current.getAttributes("image");
      const widthPercent = Number(attrs.widthPercent);
      const alignment =
        attrs.alignment === "left" || attrs.alignment === "right" ? attrs.alignment : "center";

      return {
        alt: typeof attrs.alt === "string" ? attrs.alt : "",
        caption: typeof attrs.caption === "string" ? attrs.caption : "",
        widthPercent: Number.isFinite(widthPercent) ? widthPercent : 100,
        alignment,
      };
    },
  });

  const updateSelected = (attrs: Partial<SelectedImage>): void => {
    editor?.chain().updateEditorialImage(attrs).run();
  };

  const upload = async (file: File, mode: "insert" | "replace"): Promise<void> => {
    const validation = fileError(file);

    if (validation) {
      setError(validation);
      return;
    }

    if (!editor) {
      setError("El editor todavía no está listo.");
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const signatureResponse = await fetch("/api/cloudinary/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "interior", bookId }),
      });
      const signature = await readJson<SignatureResponse & { error?: string }>(signatureResponse);

      if (!signatureResponse.ok || !signature) {
        setError(signature?.error ?? "No se ha podido preparar la subida de la imagen.");
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

      const uploadResponse = await fetch(signature.uploadUrl, {
        method: "POST",
        body: form,
      });
      const uploaded = await readJson<CloudinaryUpload & { error?: { message?: string } }>(
        uploadResponse,
      );

      if (!uploadResponse.ok || !uploaded?.secure_url) {
        setError(uploaded?.error?.message ?? "Cloudinary no ha aceptado la imagen.");
        return;
      }

      const alt = selected?.alt || file.name.replace(/\.[^.]+$/u, "");
      const registered = await registerBookAssetAction({
        bookId,
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        format: uploaded.format,
        width: uploaded.width,
        height: uploaded.height,
        bytes: uploaded.bytes,
        ...(alt ? { alt } : {}),
        ...(uploaded.original_filename ? { originalFilename: uploaded.original_filename } : {}),
      });

      if (!registered.ok) {
        setError(registered.message);
        return;
      }

      const attrs = {
        src: registered.asset.url,
        alt,
        widthPx: registered.asset.width,
        heightPx: registered.asset.height,
        widthPercent: selected?.widthPercent ?? 100,
        alignment: selected?.alignment ?? "center",
        publicId: registered.asset.publicId,
      };

      if (mode === "replace") {
        editor.chain().focus().updateEditorialImage(attrs).run();
        setMessage("Imagen reemplazada.");
      } else {
        editor.chain().focus().insertEditorialImage(attrs).run();
        setMessage("Imagen insertada.");
      }

      onAssetRegistered(registered.asset);
    } catch {
      setError("No se ha podido subir la imagen. Comprueba la conexión e inténtalo de nuevo.");
    } finally {
      setUploading(false);

      if (insertInput.current) {
        insertInput.current.value = "";
      }

      if (replaceInput.current) {
        replaceInput.current.value = "";
      }
    }
  };

  const insertFromLibrary = (asset: BookAssetSummary): void => {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertEditorialImage({
        src: asset.url,
        alt: asset.caption ?? asset.originalFilename ?? "Imagen del libro",
        widthPx: asset.width,
        heightPx: asset.height,
        widthPercent: 100,
        alignment: "center",
        publicId: asset.publicId,
      })
      .run();
    setLibraryOpen(false);
    setMessage("Imagen insertada desde la biblioteca.");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Imágenes">
        <input
          ref={insertInput}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          aria-label="Elegir una imagen de la biblioteca para insertarla"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              void upload(file, "insert");
            }
          }}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={uploading}
          onClick={() => insertInput.current?.click()}
        >
          {uploading ? "Subiendo…" : "Insertar imagen"}
        </button>
        <button
          type="button"
          className="secondary-button"
          aria-expanded={libraryOpen}
          onClick={() => setLibraryOpen((open) => !open)}
        >
          Biblioteca ({assets.length})
        </button>
      </div>

      {libraryOpen ? (
        <div
          className="rounded border border-ink/15 bg-paper/60 p-3"
          role="region"
          aria-label="Biblioteca de imágenes"
        >
          {assets.length === 0 ? (
            <p className="text-sm text-ink/70">Todavía no hay imágenes en este libro.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="block w-full rounded border border-ink/15 p-2 text-left hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={() => insertFromLibrary(asset)}
                  >
                    {/* Cloudinary ya entrega la miniatura optimizada; next/image
                        añadiría otra capa de transformación innecesaria. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={asset.caption ?? asset.originalFilename ?? "Imagen del libro"}
                      className="h-20 w-full rounded object-cover"
                      loading="lazy"
                    />
                    <span className="mt-1 block truncate text-xs text-ink/70">
                      {asset.caption ?? asset.originalFilename ?? asset.format}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {selected ? (
        <fieldset className="space-y-3 rounded border border-ink/15 p-3">
          <legend className="px-1 text-sm font-medium">Imagen seleccionada</legend>

          <label className="block text-sm">
            Texto alternativo
            <input
              className="field mt-1 w-full"
              value={selected.alt}
              maxLength={500}
              onChange={(event) => updateSelected({ alt: event.target.value })}
            />
          </label>

          <label className="block text-sm">
            Pie de imagen
            <input
              className="field mt-1 w-full"
              value={selected.caption}
              maxLength={300}
              onChange={(event) => updateSelected({ caption: event.target.value })}
            />
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Tamaño
              <select
                className="field mt-1 block"
                value={selected.widthPercent}
                onChange={(event) => updateSelected({ widthPercent: Number(event.target.value) })}
              >
                <option value={25}>25 %</option>
                <option value={50}>50 %</option>
                <option value={75}>75 %</option>
                <option value={100}>100 %</option>
              </select>
            </label>

            <div className="flex gap-1" role="group" aria-label="Alineación de la imagen">
              {(["left", "center", "right"] as const).map((alignment) => (
                <button
                  key={alignment}
                  type="button"
                  className={`icon-button ${selected.alignment === alignment ? "border-accent text-accent" : ""}`}
                  aria-label={`Alinear a la ${alignment === "left" ? "izquierda" : alignment === "right" ? "derecha" : "centro"}`}
                  aria-pressed={selected.alignment === alignment}
                  onClick={() => updateSelected({ alignment })}
                >
                  {alignment === "left" ? "⇤" : alignment === "right" ? "⇥" : "↔"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={replaceInput}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              aria-label="Elegir una imagen para sustituir la actual"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void upload(file, "replace");
                }
              }}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={uploading}
              onClick={() => replaceInput.current?.click()}
            >
              Reemplazar
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => editor?.chain().focus().deleteNode("image").run()}
            >
              Quitar imagen
            </button>
          </div>
        </fieldset>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-ink/70">
          {message}
        </p>
      ) : null}
    </div>
  );
}
