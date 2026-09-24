import { getApiError } from "@/shared/api";
import { Alert, Button, Stack } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { normalizeCatalogRule } from "../lib/normalizeCatalogRule";
import { styles } from "../styles/RuleForm";
import type { RuleFormProps } from "../types/CatalogRules";
import { RuleFeaturesEditor } from "./RuleFeaturesEditor";
import { RuleGeneralFields } from "./RuleGeneralFields";
import { RuleRoutesEditor } from "./RuleRoutesEditor";

export function RuleForm({ initial, editable, save, onSaved }: RuleFormProps) {
  const [form, setForm] = useState(initial);
  const mutation = useMutation({
    mutationFn: () => save(normalizeCatalogRule(form)),
    onSuccess: onSaved,
  });
  return (
    <Stack
      component="form"
      spacing={2}
      sx={styles.stack}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset
        disabled={!editable || mutation.isPending}
        style={styles.fieldset}
      >
        <Stack spacing={2}>
          <RuleGeneralFields form={form} onChange={setForm} />
          <RuleFeaturesEditor form={form} onChange={setForm} />
          <RuleRoutesEditor
            form={form}
            editable={editable}
            onChange={setForm}
          />
          {editable && <Button type="submit">Сохранить правило</Button>}
        </Stack>
      </fieldset>
      {mutation.error && (
        <Alert severity="error">{getApiError(mutation.error).message}</Alert>
      )}
    </Stack>
  );
}
