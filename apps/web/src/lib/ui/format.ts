export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toLocaleUpperCase("es") ?? "").join("");
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeZone: "Europe/Madrid",
});

export function formatDateTime(value: Date): string {
  return DATE_TIME_FORMATTER.format(value);
}

export function formatDate(value: Date): string {
  return DATE_FORMATTER.format(value);
}

export const WORKSPACE_ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario/a",
  ADMIN: "Administración",
  EDITOR: "Edición",
  AUTHOR: "Autoría",
  REVIEWER: "Lectura editorial",
};

export const USER_ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Superadministración",
  ADMIN: "Administración",
  AUTHOR: "Autoría",
  EDITOR: "Edición",
  REVIEWER: "Lectura editorial",
};

export const BOOK_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  IN_PROGRESS: "En escritura",
  REVIEW: "En revisión",
  COMPLETE: "Completo",
  ARCHIVED: "Archivado",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  AUTH_SETUP_COMPLETED: "Instalación completada",
  AUTH_LOGIN_SUCCEEDED: "Inicio de sesión",
  AUTH_LOGOUT: "Cierre de sesión",
  AUTH_ACCOUNT_LOCKED: "Cuenta bloqueada temporalmente",
  AUTH_PASSWORD_CHANGED: "Contraseña actualizada",
  AUTH_PASSWORD_CHANGE_FAILED: "Intento de cambio de contraseña fallido",
  AUTH_PASSWORD_RESET_COMPLETED: "Contraseña restablecida",
  AUTH_PASSWORD_RESET_ISSUED_CLI: "Enlace de recuperación emitido",
  AUTH_OTHER_SESSIONS_REVOKED: "Otras sesiones cerradas",
  ACCOUNT_PROFILE_UPDATED: "Perfil actualizado",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}

/**
 * Resume el agente de usuario para la lista de sesiones. No intenta ser un
 * detector de dispositivos exhaustivo; solo evita mostrar cadenas enormes.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) {
    return "Dispositivo no identificado";
  }

  const browser = /Edg\//u.test(userAgent)
    ? "Edge"
    : /Firefox\//u.test(userAgent)
      ? "Firefox"
      : /Chrome\//u.test(userAgent)
        ? "Chrome"
        : /Safari\//u.test(userAgent)
          ? "Safari"
          : "Navegador";

  const system = /Windows/u.test(userAgent)
    ? "Windows"
    : /Android/u.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/u.test(userAgent)
        ? "iOS/iPadOS"
        : /Mac OS X|Macintosh/u.test(userAgent)
          ? "macOS"
          : /Linux/u.test(userAgent)
            ? "Linux"
            : "sistema desconocido";

  return `${browser} · ${system}`;
}
