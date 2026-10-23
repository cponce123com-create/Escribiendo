"use client";
import { LEGAL_CLAUSES_MAX_CHARS } from "@escribiendo/templates";
export function LegalClausesField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2 text-sm">
      Cláusulas adicionales (una por línea)
      <textarea
        className="field-input min-h-32"
        name="customClauses"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={LEGAL_CLAUSES_MAX_CHARS}
      />
      <span className="block text-xs text-ink-muted">
        {value.length}/{LEGAL_CLAUSES_MAX_CHARS} caracteres. El texto se imprime tal como lo
        escribes.
      </span>
    </label>
  );
}
