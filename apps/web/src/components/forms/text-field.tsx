interface TextFieldProps {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "search";
  autoComplete?: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
  placeholder?: string;
  /**
   * El campo es obligatorio por defecto. Un campo opcional en el esquema
   * debe declarar `required={false}`: de lo contrario el navegador impide
   * enviar el formulario sin rellenarlo.
   */
  required?: boolean;
  /** Prefijo para que varias fichas de la misma página no repitan `id`. */
  idPrefix?: string;
}

export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  error,
  hint,
  defaultValue,
  placeholder,
  required = true,
  idPrefix,
}: TextFieldProps) {
  const inputId = `${idPrefix ? `${idPrefix}-` : ""}field-${name}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        className="field-input"
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
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
