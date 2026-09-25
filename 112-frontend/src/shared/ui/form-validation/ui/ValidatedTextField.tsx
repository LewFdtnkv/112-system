import { TextField, type TextFieldProps } from "@mui/material";
import { useId } from "react";
import { useFieldIssue } from "../model/ValidationContext";

export function ValidatedTextField(props: TextFieldProps) {
  const generated = useId();
  const name = props.name || props.id || generated;
  const issue = useFieldIssue(name);
  return (
    <TextField
      {...props}
      id={props.id || generated}
      name={name}
      data-validation-field={name}
      data-validation-label={
        typeof props.label === "string" ? props.label : name
      }
      error={!!issue || props.error}
      helperText={issue || props.helperText}
    />
  );
}
