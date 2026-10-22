import { Logo } from "@/components/brand/logo";
import { AlertIcon } from "@/components/icons";

/**
 * Aviso de base de datos desactualizada.
 *
 * El código y el esquema de la base de datos van por separado: las
 * migraciones se aplican a mano. Si se despliega el código nuevo sin aplicar
 * la migración, la aplicación se cae y el error que ve quien la usa es un
 * «error de interfaz» sin explicación. Esta pantalla dice exactamente qué
 * falta y cómo se arregla.
 */
export function EsquemaDesactualizado() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <Logo />
        <div className="panel mt-8 p-7">
          <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger">
            <AlertIcon className="size-5" />
          </span>
          <p className="eyebrow mt-5">Migración pendiente</p>
          <h1 className="mt-3 font-serif text-3xl text-ink">
            La base de datos está desactualizada.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            La aplicación es más nueva que la base de datos: falta aplicar una migración. En el
            servidor, ejecuta:
          </p>
          <p className="mt-3 rounded-sm bg-ink/5 px-3 py-2 font-mono text-sm text-ink">
            pnpm db:migrate
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Después, recarga la página. El cambio es aditivo: no borra datos.
          </p>
        </div>
      </div>
    </main>
  );
}
