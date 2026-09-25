import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm } from "@/shared/ui/form-validation";
import { catalogApi, serviceProfileApi } from "@/entities/training";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Alert, Button } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/ProfileForm";
import type { ProfileFormProps } from "../types/ProfilesPanel";
import { ProfileContacts } from "./ProfileContacts";
import { ProfileCrews } from "./ProfileCrews";
import { ProfileObjects } from "./ProfileObjects";
import { ProfileTerritories } from "./ProfileTerritories";

const loadServices = async (query: string, signal: AbortSignal) =>
  (await catalogApi.services({ q: query }, signal)).items.map((service) => ({
    id: service.id,
    label: `${service.code} — ${service.name}`,
  }));

export function ProfileForm({ initial, existing, onSaved }: ProfileFormProps) {
  const [form, setForm] = useState(initial);
  const [serviceLabel, setServiceLabel] = useState("Назначенная служба");
  const published = existing?.status === "published";
  const save = useMutation({
    mutationFn: () =>
      existing && !published
        ? serviceProfileApi.update(existing.id, form, existing.revision)
        : serviceProfileApi.create(form),
    onSuccess: onSaved,
  });
  return (
    <ValidatedForm
      error={save.error}
      spacing={2}
      sx={styles.stack}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      {published && (
        <Alert severity="info">
          Редактирование создаст новую черновую версию профиля.
        </Alert>
      )}
      <ServerSelect
        name="service_id"
        required
        label="Служба профиля"
        queryKey={["admin-service-options"]}
        disabled={!!existing}
        value={
          form.service_id ? { id: form.service_id, label: serviceLabel } : null
        }
        load={loadServices}
        onChange={(service) => {
          setServiceLabel(service?.label ?? "");
          setForm({ ...form, service_id: service?.id ?? "" });
        }}
      />
      <TextField
        name="name"
        label="Название профиля"
        required
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <TextField
        name="responsibility"
        label="Зона ответственности"
        required
        multiline
        minRows={2}
        value={form.responsibility}
        onChange={(event) =>
          setForm({ ...form, responsibility: event.target.value })
        }
      />
      <TextField
        name="procedure"
        label="Порядок действий и правила службы"
        multiline
        minRows={2}
        value={form.procedure}
        onChange={(event) =>
          setForm({ ...form, procedure: event.target.value })
        }
      />
      <ProfileTerritories form={form} onChange={setForm} />
      <ProfileObjects form={form} onChange={setForm} />
      <ProfileContacts form={form} onChange={setForm} />
      <ProfileCrews
        value={form.crews ?? []}
        contacts={form.contacts}
        onChange={(crews) => setForm({ ...form, crews })}
      />
      <Button type="submit" disabled={save.isPending}>
        {published ? "Сохранить новую версию профиля" : "Сохранить профиль"}
      </Button>
    </ValidatedForm>
  );
}
