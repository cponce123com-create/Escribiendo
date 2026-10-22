import { AlertIcon } from "@/components/icons";
import type { DatabaseState } from "@/lib/auth/installation";

interface DatabaseProblemProps {
  state: Exclude<DatabaseState, { status: "ready" }>;
  /** Identificador de la petición, para correlacionar con los registros. */
  requestId?: string | null;
}

/**
 * Explica por qué el acceso no está disponible.
 *
 * No oculta el fallo: indica la causa concreta y el pasos que hay que dar. El
 * error original queda registrado en el log del servidor, con su código.
 */
export function DatabaseProblem({ state, requestId }: DatabaseProblemProps) {
  const notMigrated = state.status === "not-migrated";

  return (
    <div className="panel space-y-4 p-7" role="alert">
      <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertIcon className="size-5" />
      </span>

      <div>
        <p className="eyebrow">Servicio no disponible</p>
        <h1 className="mt-3 font-serif text-2xl text-ink">
          {notMigrated
            ? "La base de datos está desactualizada."
            : "No se puede conectar con la base de datos."}
        </h1>
      </div>

      <p className="text-sm leading-relaxed text-ink-soft">
        {notMigrated ? (
          <>
            La base de datos responde, pero le faltan tablas o columnas del modelo editorial. Aplica
            las migraciones desde el equipo donde tengas el <code className="font-mono">.env</code>{" "}
            de Neon:
          </>
        ) : (
          <>
            La aplicación no logra completar una consulta a la base de datos. Revisa que{" "}
            <code className="font-mono">DATABASE_URL</code> apunte al proyecto correcto, que ese
            proyecto de Neon esté activo y que sus parámetros de conexión sean válidos.
          </>
        )}
      </p>

      {notMigrated ? (
        <pre className="overflow-x-auto rounded-sm bg-ink/[0.04] px-4 py-3 font-mono text-xs text-ink-soft">
          pnpm db:validate
          {"\n"}pnpm db:migrate
        </pre>
      ) : null}

      <p className="text-xs leading-relaxed text-ink-muted">
        Error detectado:{" "}
        {state.errorCode === "UNKNOWN" ? (
          <code className="font-mono">{state.errorName}</code>
        ) : (
          <>
            <code className="font-mono">{state.errorCode}</code>
            {state.status === "unavailable" ? (
              <>
                {" "}
                (<code className="font-mono">{state.errorName}</code>)
              </>
            ) : null}
          </>
        )}
        . El detalle completo está en los registros del servidor.
      </p>

      {requestId ? (
        <p className="font-mono text-xs text-ink-muted">Referencia: {requestId}</p>
      ) : null}
    </div>
  );
}
