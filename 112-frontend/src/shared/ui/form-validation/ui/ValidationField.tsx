import { useEffect, useId } from "react";
import { useFieldIssue, useValidation } from "../model/ValidationContext";
import type { ValidationFieldProps } from "../types";

export function ValidationField({
  name,
  label,
  children,
  validate,
  disabled,
  className = "",
}: ValidationFieldProps) {
  const context = useValidation();
  const register = context?.register;
  const issue = useFieldIssue(name);
  const id = useId();
  useEffect(
    () =>
      register?.(name, { validate: validate ?? (() => undefined), disabled }),
    [register, name, validate, disabled],
  );
  return (
    <div
      className={`validation-field ${issue ? "validation-field--invalid" : ""} ${className}`}
      data-validation-field={name}
      data-validation-label={label}
      tabIndex={-1}
      role="group"
      aria-invalid={!!issue}
      aria-describedby={issue ? id : undefined}
      onChangeCapture={() => context?.clear(name)}
      onClickCapture={() => context?.clear(name)}
    >
      {children}
      {issue && (
        <small id={id} className="field-validation-message">
          {issue}
        </small>
      )}
    </div>
  );
}
