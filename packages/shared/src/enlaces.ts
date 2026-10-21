/**
 * Enlaces del manuscrito.
 *
 * El editor solo deja escribir enlaces con esquema seguro, pero el servidor
 * no se fía de eso: un cliente modificado puede enviar un `javascript:`. Un
 * enlace así se cuela en el EPUB y en el DOCX, y quien abre el archivo lo
 * ejecuta en su lector. Aquí se decide qué esquemas se admiten.
 */

/** Esquemas que tienen sentido en un libro y no ejecutan código. */
const ESQUEMAS_SEGUROS = new Set(["http:", "https:", "mailto:", "tel:", "ftp:", "ftps:"]);

/** Indica si un enlace se puede guardar y exportar. */
export function esEnlaceSeguro(href: string): boolean {
  const limpio = href.trim();

  if (limpio.length === 0) {
    return false;
  }

  // Un enlace interno o una ruta relativa no llevan esquema.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(limpio)) {
    return !limpio.startsWith("//");
  }

  const esquema = limpio.slice(0, limpio.indexOf(":") + 1).toLowerCase();

  return ESQUEMAS_SEGUROS.has(esquema);
}
