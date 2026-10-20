import type { WorkspaceRole } from "@escribiendo/database";
import { AppError } from "../errors";

/**
 * Acciones de la biblioteca. Cada consulta y cada mutación comprueba la
 * autorización aquí, además de filtrar por el espacio de trabajo de la
 * sesión: el filtrado por `workspaceId` evita el acceso cruzado entre
 * estudios, pero no impide que alguien de un estudio sin permisos escriba.
 */
export type LibraryAction =
  | "book:create"
  | "book:update"
  | "book:delete"
  | "book:changeStatus"
  | "book:submitForReview"
  | "book:approve"
  | "section:create"
  | "section:update"
  | "section:move"
  | "section:delete"
  | "revision:restore"
  | "comment:create"
  | "comment:resolve"
  | "layout:manage"
  | "export:create"
  | "team:manage"
  | "audit:export";

/** Quien puede crear y editar libros y su estructura. */
const WRITE_ROLES: ReadonlySet<WorkspaceRole> = new Set(["OWNER", "ADMIN", "EDITOR", "AUTHOR"]);

/** Quien puede eliminar libros y secciones. */
const ADMIN_ROLES: ReadonlySet<WorkspaceRole> = new Set(["OWNER", "ADMIN"]);

/** Quien puede restaurar una revisión anterior. */
const RESTORE_ROLES: ReadonlySet<WorkspaceRole> = new Set(["OWNER", "ADMIN", "EDITOR"]);

/** Quien puede aprobar un libro y darlo por terminado. */
const APPROVE_ROLES: ReadonlySet<WorkspaceRole> = new Set(["OWNER", "ADMIN", "EDITOR"]);

/** Quien puede invitar a personas, cambiar roles y expulsar del estudio. */
const TEAM_ROLES: ReadonlySet<WorkspaceRole> = new Set(["OWNER", "ADMIN"]);

export function canPerform(role: WorkspaceRole, action: LibraryAction): boolean {
  switch (action) {
    case "book:create":
    case "book:update":
    case "book:changeStatus":
    case "book:submitForReview":
    case "section:create":
    case "section:update":
    case "section:move":
    case "comment:create":
    case "comment:resolve":
    case "layout:manage":
    case "export:create":
      return WRITE_ROLES.has(role);

    case "book:approve":
      return APPROVE_ROLES.has(role);

    case "book:delete":
    case "section:delete":
      return ADMIN_ROLES.has(role);

    case "team:manage":
    case "audit:export":
      return TEAM_ROLES.has(role);

    case "revision:restore":
      return RESTORE_ROLES.has(role);
  }
}

/**
 * Comprueba la autorización y corta la operación si no procede.
 *
 * El error es genérico a propósito: no revela qué roles existen ni qué
 * acción se intentó.
 */
export function assertCanPerform(role: WorkspaceRole, action: LibraryAction): void {
  if (!canPerform(role, action)) {
    throw new AppError("FORBIDDEN", "No tienes permisos para realizar esta acción.", 403);
  }
}
