"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteLayoutProfileAction, setDefaultLayoutProfileAction } from "@/lib/layout/actions";
import { initialActionState } from "@/lib/action-state";
import type { LayoutProfileSummary } from "@/lib/layout/profiles";
import { ConfirmButton } from "@/components/forms/confirm-button";

interface ProfileListProps {
  bookId: string;
  profiles: LayoutProfileSummary[];
  /** Identificador del perfil que usa la edición actual del libro. */
  activeProfileId: string | null;
}

/**
 * Lista de perfiles de página del estudio.
 *
 * Cada perfil puede marcarse como predeterminado o eliminarse. No se puede
 * eliminar un perfil que esté en uso por alguna edición: el servidor lo
 * comprueba y lo explica.
 */
export function ProfileList({ bookId, profiles, activeProfileId }: ProfileListProps) {
  if (profiles.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Todavía no hay perfiles de página. Crea uno con la geometría del libro: tamaño, márgenes y
        sangrado.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {profiles.map((profile) => (
        <li
          key={profile.id}
          className={`panel p-5 ${profile.id === activeProfileId ? "border-accent/50" : ""}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-lg text-ink">
                {profile.name}
                {profile.isDefault ? (
                  <span className="ml-2 align-middle text-[0.62rem] uppercase tracking-wider text-accent">
                    predeterminado
                  </span>
                ) : null}
                {profile.id === activeProfileId ? (
                  <span className="ml-2 align-middle text-[0.62rem] uppercase tracking-wider text-success">
                    en uso
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                {profile.pageWidthMm} × {profile.pageHeightMm} mm · márgenes {profile.marginTopMm}/
                {profile.marginBottomMm}/{profile.marginInnerMm}/{profile.marginOuterMm} mm
                {profile.bleedMm > 0 ? ` · sangrado ${profile.bleedMm} mm` : ""}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                className="btn btn-ghost btn-sm"
                href={`/books/${bookId}/layout/profiles/${profile.id}`}
              >
                Editar
              </Link>
              {!profile.isDefault ? <DefaultButton profileId={profile.id} /> : null}
              <DeleteButton profileId={profile.id} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DefaultButton({ profileId }: { profileId: string }) {
  const [state, formAction] = useActionState(setDefaultLayoutProfileAction, initialActionState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="profileId" value={profileId} />
      <button type="submit" className="btn btn-ghost btn-sm">
        Usar por defecto
      </button>
      {state.status !== "idle" && state.message ? (
        <span
          className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function DeleteButton({ profileId }: { profileId: string }) {
  const [state, formAction] = useActionState(deleteLayoutProfileAction, initialActionState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="profileId" value={profileId} />
      <ConfirmButton
        label="Eliminar"
        confirmLabel="Sí, eliminar"
        description="Eliminar el perfil de página"
      />
      {state.status === "error" && state.message ? (
        <span className="text-xs text-danger" role="alert">
          {state.message}
        </span>
      ) : null}
      {state.status === "success" && state.message ? (
        <span className="text-xs text-success" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
