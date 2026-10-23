interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  name: string;
  label: string;
  options: SelectOption[];
  error?: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
  /** Prefijo para que varias fichas de la misma página no repitan `id`. */
  idPrefix?: string;
}

export function SelectField({
  name,
  label,
  options,
  error,
  hint,
  defaultValue,
  required = true,
  idPrefix,
}: SelectFieldProps) {
  const inputId = `${idPrefix ? `${idPrefix}-` : ""}field-${name}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <select
        id={inputId}
        name={name}
        className="field-input"
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
