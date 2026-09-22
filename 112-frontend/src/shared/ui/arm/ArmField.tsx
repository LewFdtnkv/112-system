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
  return (
    <label
      className={`arm-field ${inline ? "arm-field--inline" : ""} ${className}`}
      htmlFor={id}
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      <span>{label}</span>
      <input id={id} {...props} />
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
  return (
    <label
      className={`arm-field arm-field--select ${className}`}
      htmlFor={id}
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      <span>{label}</span>
      <select id={id} aria-label={label} {...props}>
        {children}
      </select>
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
  return (
    <label
      className={`arm-field arm-field--textarea ${className}`}
      htmlFor={id}
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      <span>{label}</span>
      <textarea id={id} {...props} />
    </label>
  );
}
