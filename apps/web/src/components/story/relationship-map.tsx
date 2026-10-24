"use client";

import { useState } from "react";

interface MapCharacter {
  id: string;
  name: string;
}
interface MapRelation {
  id: string;
  source: MapCharacter;
  target: MapCharacter;
  kind: string;
  description: string | null;
}
const LABELS: Record<string, string> = {
  FAMILY: "Familiar",
  FRIENDSHIP: "Amistad",
  ROMANCE: "Sentimental",
  RIVALRY: "Rivalidad",
  CONFLICT: "Conflicto",
  ALLIANCE: "Alianza",
  OTHER: "Otro vínculo",
};

/** Solo representa relaciones guardadas por el autor; nunca deduce vínculos. */
export function RelationshipMap({
  characters,
  relations,
}: {
  characters: readonly MapCharacter[];
  relations: readonly MapRelation[];
}) {
  const [selected, setSelected] = useState("");
  const visible = selected
    ? relations.filter((edge) => edge.source.id === selected || edge.target.id === selected)
    : relations;
  const available = new Map(characters.map((character) => [character.id, character]));
  // Los extremos de relaciones también tienen que estar en las fichas vigentes.
  const edges = visible.filter(
    (edge) => available.has(edge.source.id) && available.has(edge.target.id),
  );
  const ids = new Set(edges.flatMap((edge) => [edge.source.id, edge.target.id]));
  if (selected) ids.add(selected);
  const nodes = characters.filter((character) => ids.has(character.id)).slice(0, 24);
  const point = (index: number) => ({
    x: 320 + Math.cos((2 * Math.PI * index) / Math.max(1, nodes.length)) * 225,
    y: 175 + Math.sin((2 * Math.PI * index) / Math.max(1, nodes.length)) * 125,
  });
  const positions = new Map(nodes.map((node, index) => [node.id, point(index)]));
  return (
    <div className="mt-5 space-y-4">
      <label className="block text-sm font-medium text-ink" htmlFor="relationship-character">
        Explorar relaciones de un personaje
      </label>
      <select
        id="relationship-character"
        className="field-input max-w-md"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Todos los personajes</option>
        {characters.map((character) => (
          <option key={character.id} value={character.id}>
            {character.name}
          </option>
        ))}
      </select>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-line bg-surface-subtle p-3">
          <svg
            viewBox="0 0 640 350"
            className="w-full"
            role="img"
            aria-label="Mapa de relaciones manuales"
          >
            <title>
              Relaciones guardadas. Usa el selector para filtrar y la lista para leer cada vínculo.
            </title>
            {edges.map((edge) => {
              const a = positions.get(edge.source.id),
                b = positions.get(edge.target.id);
              return a && b ? (
                <line
                  key={edge.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="stroke-accent/60"
                  strokeWidth="2"
                />
              ) : null;
            })}
            {nodes.map((node) => {
              const p = positions.get(node.id)!;
              return (
                <g key={node.id}>
                  <circle cx={p.x} cy={p.y} r="26" className="fill-surface stroke-accent" />
                  <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-ink text-[11px]">
                    <title>{node.name}</title>
                    {node.name.length > 14 ? `${node.name.slice(0, 13)}…` : node.name}
                  </text>
                </g>
              );
            })}
            {!nodes.length ? (
              <text x="320" y="175" textAnchor="middle" className="fill-ink-muted text-sm">
                Sin relaciones manuales
              </text>
            ) : null}
          </svg>
          {ids.size > nodes.length ? (
            <p className="text-xs text-ink-muted">
              El mapa muestra {nodes.length} personajes; consulta todos los vínculos en la lista o
              filtra por personaje.
            </p>
          ) : null}
        </div>
        <div aria-live="polite">
          <p className="mb-3 text-sm text-ink-muted">
            {edges.length} vínculos guardados en esta selección.
          </p>
          <ul
            className="max-h-96 space-y-2 overflow-y-auto"
            tabIndex={0}
            aria-label="Relaciones de la selección"
          >
            {edges.map((edge) => (
              <li key={edge.id} className="rounded-lg border border-line p-3 text-sm">
                <strong>
                  {edge.source.name} — {LABELS[edge.kind] ?? "Otro vínculo"} — {edge.target.name}
                </strong>
                {edge.description ? (
                  <p className="mt-1 text-ink-muted">{edge.description}</p>
                ) : null}
              </li>
            ))}
            {!edges.length ? (
              <li className="text-sm text-ink-muted">
                Añade relaciones desde la ficha de un personaje.
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
