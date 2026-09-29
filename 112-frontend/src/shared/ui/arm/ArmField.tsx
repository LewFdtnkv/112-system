import { useFieldIssue } from "@/shared/ui/form-validation";
import { useId } from "react";
import { useFieldFeedback } from "./FieldFeedback";
import type {
  ArmFieldProps,
  ArmSelectProps,
  ArmTextareaProps,
} from "./types/ArmField";
export function ArmField({
  label,
  className = "",
  inline = false,
  ...props
}: ArmFieldProps) {
  const id = useId();
  const feedback = useFieldFeedback(label);
  const name = props.name || id;
  const issue = useFieldIssue(name);
  return (
    <label
      className={`arm-field ${inline ? "arm-field--inline" : ""} ${className}`}
      htmlFor={id}
      data-validation-field={name}
      data-validation-label={label}
      aria-invalid={issue ? true : undefined}
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      <span>{label}</span>
      <input
        id={id}
        {...props}
        name={name}
        aria-invalid={!!issue || props["aria-invalid"]}
        aria-describedby={issue ? `${id}-error` : props["aria-describedby"]}
      />
      {issue && (
        <small id={`${id}-error`} className="field-validation-message">
          {issue}
        </small>
      )}
    </label>
  );
}
export function ArmSelect({
  label,
  className = "",
  children,
  ...props
}: ArmSelectProps) {
  const id = useId();
  const feedback = useFieldFeedback(label);
  const name = props.name || id;
  const issue = useFieldIssue(name);
  return (
    <label
      className={`arm-field arm-field--select ${className}`}
      htmlFor={id}
      data-validation-field={name}
      data-validation-label={label}
      aria-invalid={issue ? true : undefined}
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      <span>{label}</span>
      <select
        id={id}
        aria-label={label}
        {...props}
        name={name}
        aria-invalid={!!issue || props["aria-invalid"]}
        aria-describedby={issue ? `${id}-error` : props["aria-describedby"]}
      >
        {children}
      </select>
      {issue && (
        <small id={`${id}-error`} className="field-validation-message">
          {issue}
        </small>
      )}
    </label>
  );
}
export function ArmTextarea({
  label,
  className = "",
  ...props
}: ArmTextareaProps) {
  const id = useId();
  const feedback = useFieldFeedback(label);
  const name = props.name || id;
  const issue = useFieldIssue(name);
  return (
    <label
      className={`arm-field arm-field--textarea ${className}`}
      htmlFor={id}
      data-validation-field={name}
      data-validation-label={label}
      aria-invalid={issue ? true : undefined}
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      <span>{label}</span>
      <textarea
        id={id}
        {...props}
        name={name}
        aria-invalid={!!issue || props["aria-invalid"]}
        aria-describedby={issue ? `${id}-error` : props["aria-describedby"]}
      />
      {issue && (
        <small id={`${id}-error`} className="field-validation-message">
          {issue}
        </small>
      )}
    </label>
  );
}
