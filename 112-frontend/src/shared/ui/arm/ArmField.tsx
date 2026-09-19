import {
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type Base = { label: string; className?: string; inline?: boolean };
export function ArmField({
  label,
  className = "",
  inline = false,
  ...props
}: Base & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <label
      className={`arm-field ${inline ? "arm-field--inline" : ""} ${className}`}
      htmlFor={id}
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
  return (
    <label className={`arm-field arm-field--select ${className}`} htmlFor={id}>
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
  return (
    <label
      className={`arm-field arm-field--textarea ${className}`}
      htmlFor={id}
    >
      <span>{label}</span>
      <textarea id={id} {...props} />
    </label>
  );
}
