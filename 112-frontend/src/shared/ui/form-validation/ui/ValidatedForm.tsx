import { Stack } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiError, getApiFieldErrors } from "@/shared/api";
import { ValidationContext } from "../model/ValidationContext";
import { focusIssue, nativeIssues } from "../lib/validation";
import type { FieldIssue, FieldRule, ValidatedFormProps } from "../types";
import "../styles/validation.scss";

export function ValidatedForm({
  error,
  validate,
  onSubmit,
  children,
  ...props
}: ValidatedFormProps) {
  const root = useRef<HTMLFormElement>(null);
  const rules = useRef(new Map<string, FieldRule>());
  const [local, setLocal] = useState<FieldIssue[]>([]);
  const [dismissed, setDismissed] = useState<{
    error: unknown;
    paths: string[];
  }>({ error: null, paths: [] });
  const server = useMemo(() => getApiFieldErrors(error), [error]);
  const issues = [
    ...local,
    ...server.filter(
      (e) =>
        !local.some((l) => l.path === e.path) &&
        !(dismissed.error === error && dismissed.paths.includes(e.path)),
    ),
  ];
  const clear = useCallback(
    (path: string) => {
      setLocal((items) =>
        items.some((e) => e.path === path)
          ? items.filter((e) => e.path !== path)
          : items,
      );
      if (server.some((e) => e.path === path))
        setDismissed((state) => {
          const paths = state.error === error ? state.paths : [];
          return paths.includes(path)
            ? state
            : { error, paths: [...paths, path] };
        });
    },
    [error, server],
  );
  const register = useCallback((path: string, rule: FieldRule) => {
    rules.current.set(path, rule);
    return () => {
      rules.current.delete(path);
    };
  }, []);
  useEffect(() => {
    if (server.length) focusIssue(root.current, server[0].path);
  }, [server]);
  return (
    <ValidationContext.Provider value={{ issues, clear, register }}>
      <Stack
        {...props}
        component="form"
        data-validation-layout={props.direction === "row" ? "row" : undefined}
        useFlexGap={props.direction === "row" || props.useFlexGap}
        ref={root}
        noValidate
        onChangeCapture={(event) => {
          const target = event.target as HTMLElement;
          const path = target.closest<HTMLElement>("[data-validation-field]")
            ?.dataset.validationField;
          if (path) clear(path);
          props.onChangeCapture?.(event);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const found = [
            ...nativeIssues(event.currentTarget),
            ...Array.from(rules.current).flatMap(([path, rule]) => {
              const message = !rule.disabled && rule.validate();
              return message ? [{ path, message }] : [];
            }),
            ...(validate?.() ?? []),
          ];
          setLocal(found);
          if (found.length) {
            focusIssue(root.current, found[0].path);
            return;
          }
          onSubmit(event);
        }}
      >
        {(issues.length > 0 || (!!error && !server.length)) && (
          <div className="form-validation-summary" role="alert">
            {issues.length
              ? "Проверьте выделенные поля:"
              : getApiError(error).message}
            {issues.length > 0 && (
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.path}:${index}`}>
                    <button
                      type="button"
                      onClick={() => focusIssue(root.current, issue.path)}
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {children}
      </Stack>
    </ValidationContext.Provider>
  );
}
