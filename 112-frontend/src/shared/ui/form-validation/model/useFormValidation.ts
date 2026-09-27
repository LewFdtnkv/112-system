import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import { getApiFieldErrors } from "@/shared/api";
import { focusIssue, nativeIssues } from "../lib/validation";
import { formIssues } from "../lib/formIssues";
import type { FieldIssue, FieldRule } from "../types";

/** RHF owns registration and errors; this adapter handles HTML constraints and API paths. */
export function useFormValidation<T extends FieldValues>(
  external?: UseFormReturn<T>,
  error?: unknown,
) {
  const internal = useForm<T>({ shouldFocusError: false });
  const form = external ?? internal;
  const {
    register: registerField,
    unregister,
    clearErrors,
    setError,
    formState: { errors },
  } = form;
  const root = useRef<HTMLFormElement>(null);
  const server = useMemo(() => getApiFieldErrors(error), [error]);
  const issues = formIssues(errors);
  const clear = useCallback(
    // Clearing a group path also deletes errors of its unchanged children.
    // Remove only this node's RHF metadata; keep descendant field errors.
    (path: string) =>
      clearErrors(
        ["message", "type", "types", "ref"].map(
          (key) => `${path}.${key}` as Path<T>,
        ),
      ),
    [clearErrors],
  );
  const register = useCallback(
    (path: string, rule: FieldRule) => {
      registerField(
        path as Path<T>,
        rule.validate
          ? {
              validate: () =>
                rule.disabled ? true : rule.validate?.() || true,
            }
          : undefined,
      );
      return () => unregister(path as Path<T>);
    },
    [registerField, unregister],
  );
  const report = useCallback(
    (found: FieldIssue[]) => {
      for (const issue of found)
        setError((issue.path || "root.form") as Path<T>, {
          type: "validation",
          message: issue.message,
        });
      if (found.length) focusIssue(root.current, found[0].path);
    },
    [setError],
  );
  useEffect(() => {
    report(server);
  }, [report, server]);
  const validateConstraints = (validate?: () => FieldIssue[]) => {
    const found = [
      ...(root.current ? nativeIssues(root.current) : []),
      ...(validate?.() ?? []),
    ];
    report(found);
    return found;
  };
  return {
    form,
    root,
    server,
    issues,
    clear,
    register,
    report,
    validateConstraints,
  };
}
