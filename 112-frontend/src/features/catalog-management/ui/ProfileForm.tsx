import { trainingApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Alert, Button, Paper, Stack, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/ProfileForm";
import type { ProfileFormProps } from "../types/ProfilesPanel";
import { ProfileCrews } from "./ProfileCrews";
export function ProfileForm({ initial, existing, onSaved }: ProfileFormProps) {
  const [form, setForm] = useState(initial);
  const [serviceLabel, setServiceLabel] = useState("Назначенная служба");
  const published = existing?.status === "published";
  const save = useMutation({
    mutationFn: () =>
      existing && !published
        ? trainingApi.updateProfile(existing.id, form, existing.revision)
        : trainingApi.createProfile(form),
    onSuccess: onSaved,
  });
  const services = async (q: string, signal: AbortSignal) =>
    (await trainingApi.adminServices({ q }, signal)).items.map((s) => ({
      id: s.id,
      label: `${s.code} — ${s.name}`,
    }));
  return (
    <Stack
      component="form"
      spacing={2}
      sx={styles.stack}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {published && (
        <Alert severity="info">
          Редактирование создаст новую черновую версию профиля.
        </Alert>
      )}
      <ServerSelect
        label="Служба профиля"
        queryKey={["admin-service-options"]}
        disabled={!!existing}
        value={
          form.service_id ? { id: form.service_id, label: serviceLabel } : null
        }
        load={services}
        onChange={(v) => {
          setServiceLabel(v?.label ?? "");
          setForm({ ...form, service_id: v?.id ?? "" });
        }}
      />
      <TextField
        label="Название профиля"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <TextField
        label="Зона ответственности"
        required
        multiline
        minRows={2}
        value={form.responsibility}
        onChange={(e) => setForm({ ...form, responsibility: e.target.value })}
      />
      <TextField
        label="Порядок действий и правила службы"
        multiline
        minRows={2}
        value={form.procedure}
        onChange={(e) => setForm({ ...form, procedure: e.target.value })}
      />
      <b>Территории</b>
      {form.territories.map((t, i) => (
        <Paper key={i} sx={styles.paper}>
          <Stack spacing={1}>
            {(["code", "name", "description"] as const).map((k) => (
              <TextField
                key={k}
                required={k !== "description"}
                label={
                  {
                    code: "Код территории",
                    name: "Название территории",
                    description: "Описание территории",
                  }[k]
                }
                value={t[k]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    territories: form.territories.map((x, j) =>
                      j === i ? { ...x, [k]: e.target.value } : x,
                    ),
                  })
                }
              />
            ))}
            <Button
              onClick={() =>
                setForm({
                  ...form,
                  territories: form.territories.filter((_, j) => j !== i),
                })
              }
            >
              Удалить территорию
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          setForm({
            ...form,
            territories: [
              ...form.territories,
              {
                code: `area-${form.territories.length + 1}`,
                name: "",
                description: "",
              },
            ],
          })
        }
      >
        Добавить территорию
      </Button>
      <b>Объекты</b>
      {form.objects.map((o, i) => (
        <Paper key={i} sx={styles.paper2}>
          <Stack spacing={1}>
            {(
              [
                "code",
                "name",
                "territory_code",
                "address",
                "responsibility",
              ] as const
            ).map((k) => (
              <TextField
                key={k}
                required={k !== "territory_code"}
                label={
                  {
                    code: "Код объекта",
                    name: "Название объекта",
                    territory_code: "Код территории объекта",
                    address: "Адрес объекта",
                    responsibility: "Ответственность по объекту",
                  }[k]
                }
                value={o[k] ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    objects: form.objects.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            [k]:
                              k === "territory_code"
                                ? e.target.value || null
                                : e.target.value,
                          }
                        : x,
                    ),
                  })
                }
              />
            ))}
            <Button
              onClick={() =>
                setForm({
                  ...form,
                  objects: form.objects.filter((_, j) => j !== i),
                })
              }
            >
              Удалить объект
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          setForm({
            ...form,
            objects: [
              ...form.objects,
              {
                code: `object-${form.objects.length + 1}`,
                name: "",
                territory_code: null,
                address: "",
                responsibility: "",
              },
            ],
          })
        }
      >
        Добавить объект
      </Button>
      <b>Учебные контакты</b>
      {form.contacts.map((c, i) => (
        <Paper key={i} sx={styles.paper3}>
          <Stack spacing={1}>
            <ServerSelect
              label={`Служба контакта ${i + 1}`}
              queryKey={["admin-service-options"]}
              load={services}
              value={
                c.target_service_id
                  ? {
                      id: c.target_service_id,
                      label: "Выбранная служба контакта",
                    }
                  : null
              }
              onChange={(v) =>
                setForm({
                  ...form,
                  contacts: form.contacts.map((x, j) =>
                    j === i ? { ...x, target_service_id: v?.id ?? "" } : x,
                  ),
                })
              }
            />
            {(
              [
                "code",
                "name",
                "position",
                "description",
                "endpoint_key",
              ] as const
            ).map((k) => (
              <TextField
                key={k}
                required={["code", "name", "endpoint_key"].includes(k)}
                label={
                  {
                    code: "Код контакта",
                    name: "Название контакта",
                    position: "Должность",
                    description: "Когда обращаться",
                    endpoint_key: "Ключ учебного абонента",
                  }[k]
                }
                value={c[k] ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contacts: form.contacts.map((x, j) =>
                      j === i ? { ...x, [k]: e.target.value } : x,
                    ),
                  })
                }
              />
            ))}
            <Button
              onClick={() =>
                setForm({
                  ...form,
                  contacts: form.contacts.filter((_, j) => j !== i),
                })
              }
            >
              Удалить контакт
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        onClick={() =>
          setForm({
            ...form,
            contacts: [
              ...form.contacts,
              {
                code: `contact-${form.contacts.length + 1}`,
                name: "",
                description: "",
                target_service_id: form.service_id,
                position: null,
                endpoint_key: "",
              },
            ],
          })
        }
      >
        Добавить учебный контакт
      </Button>
      <small>
        Контакты предназначены для локального учебного контура. Телефония настраивается администратором.
      </small>
      <ProfileCrews
        value={form.crews ?? []}
        contacts={form.contacts}
        onChange={(crews) => setForm({ ...form, crews })}
      />
      {save.error && (
        <Alert severity="error">{getApiError(save.error).message}</Alert>
      )}
      <Button type="submit" disabled={!form.service_id || save.isPending}>
        {published ? "Сохранить новую версию профиля" : "Сохранить профиль"}
      </Button>
    </Stack>
  );
}
