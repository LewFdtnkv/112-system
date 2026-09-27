import { catalogApi } from "@/entities/catalog";
import { ValidatedForm, ValidatedTextField } from "@/shared/ui/form-validation";
import { Button } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ServiceFormProps } from "../types/ServiceDialog";

export function ServiceForm({ service, onSaved, onCancel }: ServiceFormProps) {
  const [code, setCode] = useState(service?.code ?? "");
  const [name, setName] = useState(service?.name ?? "");
  const [shortName, setShortName] = useState(service?.short_name ?? "");
  const save = useMutation({
    mutationFn: () => {
      const names = { name: name.trim(), short_name: shortName.trim() || null };
      return service
        ? catalogApi.updateService(service.id, names)
        : catalogApi.createService({ code: code.trim(), ...names });
    },
    onSuccess: onSaved,
  });
  return (
    <ValidatedForm
      error={save.error}
      spacing={2}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <ValidatedTextField
        name="code"
        label="Код службы"
        required
        disabled={!!service}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        slotProps={{ htmlInput: { pattern: "[a-z0-9_\\-]+", maxLength: 50 } }}
      />
      <ValidatedTextField
        name="short_name"
        label="Короткое название службы"
        value={shortName}
        onChange={(event) => setShortName(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <ValidatedTextField
        name="name"
        label="Полное наименование службы"
        required
        multiline
        value={name}
        onChange={(event) => setName(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 255 } }}
      />
      <div className="service-dialog__actions">
        <Button type="submit" disabled={save.isPending}>
          {service ? "Сохранить службу" : "Создать службу"}
        </Button>
        <Button disabled={save.isPending} onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </ValidatedForm>
  );
}
