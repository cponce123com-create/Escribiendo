"use client";

import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

interface PasswordFieldProps {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  hint?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}

export function PasswordField({
  name,
  label,
  autoComplete,
  error,
  hint,
  defaultValue,
  placeholder,
  required = true,
}: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-wrap">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          className="field-input"
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy || undefined}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
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
