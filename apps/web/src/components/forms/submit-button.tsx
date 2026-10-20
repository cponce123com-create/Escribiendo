"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  label: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}

export function SubmitButton({
  label,
  pendingLabel,
  className = "btn btn-primary btn-block",
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
