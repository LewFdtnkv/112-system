import type {
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";
import type { StackProps } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

import type { ApiFieldError } from "@/shared/types/types";
export type FieldIssue = ApiFieldError;
export type FieldRule = {
  validate?: () => string | undefined;
  disabled?: boolean;
};
export type ValidationContextValue = {
  issues: FieldIssue[];
  clear: (path: string) => void;
  register: (path: string, rule: FieldRule) => () => void;
};
export type ValidatedFormProps<T extends FieldValues = FieldValues> = Omit<
  StackProps<"form">,
  "onSubmit" | "component" | "ref"
> & {
  error?: unknown;
  form?: UseFormReturn<T>;
  onValid?: SubmitHandler<T>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  validate?: () => FieldIssue[];
};
export type ValidationFieldProps = {
  name: string;
  label: string;
  children: ReactNode;
  validate?: () => string | undefined;
  disabled?: boolean;
  className?: string;
};
export type FieldErrorsProps = {
  issues: FieldIssue[];
  focusKey?: unknown;
  children: ReactNode;
};
