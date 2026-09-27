import { useEffect, useLayoutEffect, useRef, useId } from "react";
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
  const check = useRef({ validate, disabled });
  useLayoutEffect(() => {
    check.current = { validate, disabled };
  }, [validate, disabled]);
  useEffect(
    () =>
      register?.(name, {
        validate: () =>
          check.current.disabled ? undefined : check.current.validate?.(),
      }),
    [register, name],
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
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest(
            'button[aria-pressed], [role="option"], [role="checkbox"]',
          )
        )
          context?.clear(name);
      }}
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
