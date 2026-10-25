"use client";
import { useActionState, type ReactNode } from "react";
import { updateNarrativePlanningAction } from "@/lib/story/narrative-planning-actions";
import type { NarrativePlanningData } from "@/lib/story/narrative-planning-queries";
import {
  chronologyWarnings,
  formatNarrativePeriod,
  narrativeStructure,
  NARRATIVE_STRUCTURES,
} from "@/lib/story/narrative-planning";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

function PlanningForm({
  data,
  operation,
  id,
  children,
  submit = "Guardar",
}: {
  data: NarrativePlanningData;
  operation: string;
  id?: string;
  children?: ReactNode;
  submit?: string;
}) {
  const [state, action] = useActionState(updateNarrativePlanningAction, { status: "idle" });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="bookId" value={data.book.id} />
      <input type="hidden" name="version" value={data.book.narrativeVersion} />
      <input type="hidden" name="operation" value={operation} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {children}
      <SubmitButton label={submit} pendingLabel="Guardando…" />
      <FormMessage state={state} />
    </form>
  );
}
function EventFields({
  data,
  event,
}: {
  data: NarrativePlanningData;
  event?: NarrativePlanningData["events"][number];
}) {
  const id = event?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm text-ink">
        Título del acontecimiento
        <input
          className="field-input"
          name="title"
          defaultValue={event?.title}
          maxLength={200}
          required
        />
      </label>
      <label className="block text-sm text-ink">
        Personaje del acontecimiento
        <select
          className="field-input"
          name="characterId"
          defaultValue={event?.characterId ?? ""}
          required
        >
          <option value="" disabled>
            Selecciona un personaje
          </option>
          {data.characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-ink">
        Capítulo de origen
        <select className="field-input" name="sectionId" defaultValue={event?.sectionId ?? ""}>
          <option value="">Sin capítulo</option>
          {data.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-ink">
        Precisión de la fecha
        <select
          className="field-input"
          name="datePrecision"
          defaultValue={event?.datePrecision ?? "UNDATED"}
        >
          <option value="UNDATED">Sin fecha</option>
          <option value="EXACT">Exacta</option>
          <option value="APPROXIMATE">Aproximada</option>
          <option value="YEAR">Solo año</option>
        </select>
      </label>
      <label className="block text-sm text-ink">
        Fecha inicial
        <input
          className="field-input"
          type="date"
          name="startsOn"
          defaultValue={event?.startsOn ?? ""}
          aria-describedby={`period-help-${id}`}
        />
      </label>
      <label className="block text-sm text-ink">
        Fecha final (opcional)
        <input
          className="field-input"
          type="date"
          name="endsOn"
          defaultValue={event?.endsOn ?? ""}
        />
      </label>
      <p id={`period-help-${id}`} className="text-xs text-ink-muted sm:col-span-2">
        Para fechas desconocidas deja ambos campos vacíos. En «Solo año», utiliza el 1 de enero; se
        mostrará únicamente el año.
      </p>
      <label className="block text-sm text-ink sm:col-span-2">
        Detalles del acontecimiento
        <textarea
          className="field-input"
          name="details"
          maxLength={4000}
          defaultValue={event?.details ?? ""}
        />
      </label>
    </div>
  );
}
export function NarrativePlanningPanel({
  data,
  canManage,
}: {
  data: NarrativePlanningData;
  canManage: boolean;
}) {
  const structure = narrativeStructure(data.book.narrativeStructure),
    stages = NARRATIVE_STRUCTURES[structure] as readonly string[];
  const warnings = chronologyWarnings(data.events);
  return (
    <div className="space-y-6">
      <section className="panel scroll-mt-24 p-5" aria-labelledby="timeline-edit-title">
        <h2 id="timeline-edit-title" className="font-serif text-2xl text-ink">
          Fechas y orden cronológico
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          La fecha pertenece a la historia; no cambia el orden del manuscrito. Las fechas
          aproximadas y los años sin día conocido se muestran como tales.
        </p>
        {warnings.map((warning, index) => (
          <p key={`${warning.id}-${index}`} className="alert mt-3" role="status">
            {warning.message}
          </p>
        ))}
        {data.truncated ? (
          <p className="alert">Se muestran los primeros 1.000 acontecimientos.</p>
        ) : null}
        <ol className="my-5 space-y-4">
          {data.events.map((event, index) => (
            <li key={event.id} className="rounded-xl border border-line p-4">
              <h3 className="font-semibold text-ink">
                {index + 1}. {event.title}
              </h3>
              <p className="my-2 text-sm text-ink-soft">
                {formatNarrativePeriod(event)} ·{" "}
                {event.suggested ? "Sugerencia sin confirmar" : "Registrado por el autor"}
              </p>
              {canManage ? (
                <>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-ink">
                      Editar acontecimiento
                    </summary>
                    <div className="mt-3">
                      <PlanningForm
                        data={data}
                        operation="event"
                        id={event.id}
                        submit="Guardar acontecimiento"
                      >
                        <EventFields data={data} event={event} />
                      </PlanningForm>
                    </div>
                  </details>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {index > 0 ? (
                      <PlanningForm
                        data={data}
                        operation="move"
                        id={event.id}
                        submit={`Subir «${event.title}»`}
                      >
                        <input type="hidden" name="direction" value="up" />
                      </PlanningForm>
                    ) : null}
                    {index < data.events.length - 1 ? (
                      <PlanningForm
                        data={data}
                        operation="move"
                        id={event.id}
                        submit={`Bajar «${event.title}»`}
                      >
                        <input type="hidden" name="direction" value="down" />
                      </PlanningForm>
                    ) : null}
                  </div>
                </>
              ) : null}
            </li>
          ))}
        </ol>
        {canManage ? (
          <details>
            <summary className="cursor-pointer font-semibold text-ink">
              Añadir acontecimiento
            </summary>
            <div className="mt-4">
              <PlanningForm data={data} operation="event" submit="Crear acontecimiento">
                <EventFields data={data} />
              </PlanningForm>
            </div>
          </details>
        ) : null}
      </section>
      <section className="panel scroll-mt-24 p-5" aria-labelledby="structure-title">
        <h2 id="structure-title" className="font-serif text-2xl text-ink">
          Estructura narrativa guardada
        </h2>
        <p className="my-3 text-sm text-ink-soft">
          El modelo es opcional y se comparte con el equipo. Cambiarlo conserva las etapas
          anteriores hasta que decidas reasignarlas.
        </p>
        {canManage ? (
          <PlanningForm data={data} operation="structure" submit="Guardar estructura">
            <label className="field-label" htmlFor="saved-structure">
              Modelo narrativo
            </label>
            <select
              id="saved-structure"
              className="field-input"
              name="structure"
              defaultValue={structure}
            >
              <option value="FREE">Estructura libre</option>
              <option value="THREE_ACTS">Tres actos</option>
              <option value="FIVE_ACTS">Cinco actos</option>
              <option value="HERO_JOURNEY">Viaje del héroe</option>
            </select>
          </PlanningForm>
        ) : (
          <p className="text-ink">
            {
              {
                FREE: "Estructura libre",
                THREE_ACTS: "Tres actos",
                FIVE_ACTS: "Cinco actos",
                HERO_JOURNEY: "Viaje del héroe",
              }[structure]
            }
          </p>
        )}
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {data.sections.map((section) => (
            <li key={section.id} className="rounded-lg border border-line p-3">
              <h3 className="mb-2 font-semibold text-ink">{section.title}</h3>
              {section.narrativeStage && !stages.includes(section.narrativeStage) ? (
                <p className="alert mb-2">Etapa anterior conservada: {section.narrativeStage}</p>
              ) : null}
              {canManage ? (
                <PlanningForm
                  data={data}
                  operation="stage"
                  id={section.id}
                  submit={`Guardar etapa de «${section.title}»`}
                >
                  <label className="field-label" htmlFor={`stage-${section.id}`}>
                    Etapa de {section.title}
                  </label>
                  <select
                    id={`stage-${section.id}`}
                    name="stage"
                    className="field-input"
                    defaultValue={
                      stages.includes(section.narrativeStage ?? "")
                        ? (section.narrativeStage ?? "")
                        : ""
                    }
                  >
                    <option value="">Sin etapa</option>
                    {stages.map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                </PlanningForm>
              ) : (
                <p>{section.narrativeStage ?? "Sin etapa"}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
