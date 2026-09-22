import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
export type Base = { label: string; className?: string; inline?: boolean };

export type ArmFieldProps = Base & InputHTMLAttributes<HTMLInputElement>;
export type ArmSelectProps = Base & SelectHTMLAttributes<HTMLSelectElement>;
export type ArmTextareaProps = Base &
  TextareaHTMLAttributes<HTMLTextAreaElement>;
