interface TextareaFieldProps {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  /** Prefijo para que varias fichas de la misma página no repitan `id`. */
  idPrefix?: string;
}

export function TextareaField({
  name,
  label,
  error,
  hint,
  defaultValue,
  placeholder,
  rows = 4,
  required = false,
  idPrefix,
}: TextareaFieldProps) {
  const inputId = `${idPrefix ? `${idPrefix}-` : ""}field-${name}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        id={inputId}
        name={name}
        className="field-input"
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        rows={rows}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
