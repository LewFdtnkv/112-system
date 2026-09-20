import {
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFieldFeedback } from "./FieldFeedback";

type Base = { label: string; className?: string; inline?: boolean };
export function ArmField({
  label,
  className = "",
  inline = false,
  ...props
}: Base & InputHTMLAttributes<HTMLInputElement>) {
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
}: Base & SelectHTMLAttributes<HTMLSelectElement>) {
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
      <select id={id} {...props}>
        {children}
      </select>
    </label>
  );
}
export function ArmTextarea({
  label,
  className = "",
  ...props
}: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
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
