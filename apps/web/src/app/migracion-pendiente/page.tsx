import type { Metadata } from "next";
import { EsquemaDesactualizado } from "@/components/app/schema-error";

export const metadata: Metadata = {
  title: "Migración pendiente",
  robots: { index: false, follow: false },
};

/**
 * Pantalla pública para cuando el código es más nuevo que la base de datos.
 *
 * Es estática a propósito: se puede servir aunque la base de datos no tenga el
 * esquema que la aplicación espera. Las páginas privadas redirigen aquí desde
 * `requireSession` y el acceso la muestra antes de intentar leer la sesión.
 */
export default function MigrationPendingPage() {
  return <EsquemaDesactualizado />;
}
