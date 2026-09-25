import { useEffect, useRef } from "react";
import { ValidationContext } from "../model/ValidationContext";
import { focusIssue } from "../lib/validation";
import type { FieldErrorsProps } from "../types";
import "../styles/validation.scss";

export function FieldErrors({ issues, focusKey, children }: FieldErrorsProps) {
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<unknown>(undefined);
  useEffect(() => {
    if (lastFocus.current === focusKey) return;
    lastFocus.current = focusKey;
    if (issues.length) focusIssue(root.current, issues[0].path);
  }, [issues, focusKey]);
  return (
    <ValidationContext.Provider
      value={{ issues, clear: () => {}, register: () => () => {} }}
    >
      <div className="validation-boundary" ref={root}>
        {issues.length > 0 && (
          <div role="alert" className="form-validation-summary">
            Проверьте выделенные поля:
            <ul>
              {issues.map((issue) => (
                <li key={issue.path}>
                  <button
                    type="button"
                    onClick={() => focusIssue(root.current, issue.path)}
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {children}
      </div>
    </ValidationContext.Provider>
  );
}
