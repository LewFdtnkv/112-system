import { Stack } from "@mui/material";
import type { FieldValues } from "react-hook-form";
import { getApiError } from "@/shared/api";
import { ValidationContext } from "../model/ValidationContext";
import { useFormValidation } from "../model/useFormValidation";
import { focusIssue } from "../lib/validation";
import { formIssues } from "../lib/formIssues";
import type { ValidatedFormProps } from "../types";
import "../styles/validation.scss";

export function ValidatedForm<T extends FieldValues>({
  form: external,
  onValid,
  error,
  validate,
  onSubmit,
  children,
  ...props
}: ValidatedFormProps<T>) {
  const {
    form,
    root,
    server,
    issues,
    clear,
    register,
    report,
    validateConstraints,
  } = useFormValidation(external, error);
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
          form.clearErrors();
          // Native and cross-field constraints supplement RHF's registered validators.
          void form.handleSubmit(
            async (values) => {
              if (validateConstraints(validate).length) return;
              if (onValid) await onValid(values, event);
              else onSubmit?.(event);
            },
            (errors) => {
              const constraints = validateConstraints(validate);
              report([...constraints, ...formIssues(errors)]);
            },
          )(event);
        }}
      >
        {(issues.length > 0 || (!!error && !server.length)) && (
          <div className="form-validation-summary" role="alert">
            {issues.length
              ? issues.some((issue) => !issue.path)
                ? "Проверьте данные формы:"
                : "Проверьте выделенные поля:"
              : getApiError(error).message}
            {issues.length > 0 && (
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.path}:${index}`}>
                    {issue.path ? (
                      <button
                        type="button"
                        onClick={() => focusIssue(root.current, issue.path)}
                      >
                        {issue.message}
                      </button>
                    ) : (
                      issue.message
                    )}
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
