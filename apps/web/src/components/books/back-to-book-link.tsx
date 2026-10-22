"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { saveSectionScrollPosition } from "@/lib/editor/scroll-position";

interface BackToBookLinkProps {
  bookId: string;
  sectionId: string;
}

/**
 * Vuelta contextual al libro.
 *
 * No usa `history.back()`: el historial puede llevar al acceso, a otra
 * sección o a una página externa. El destino es siempre la ficha del libro y
 * el ancla devuelve la vista a la sección que se estaba editando.
 */
export function BackToBookLink({ bookId, sectionId }: BackToBookLinkProps) {
  return (
    <Link
      href={`/books/${bookId}#section-${sectionId}`}
      className="btn btn-secondary btn-sm"
      onClick={() => saveSectionScrollPosition(bookId, sectionId)}
    >
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      Volver al libro
    </Link>
  );
}
