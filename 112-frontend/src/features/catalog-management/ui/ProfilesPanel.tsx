import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  trainingApi,
  type ProfileInput,
  type ServiceProfile,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
const empty: ProfileInput = {
  service_id: "",
  name: "",
  responsibility: "",
  procedure: "",
  territories: [],
  objects: [],
  contacts: [],
};
const input = (p: ServiceProfile): ProfileInput => ({
  service_id: p.service_id,
  name: p.name,
  responsibility: p.responsibility,
  procedure: p.procedure,
  territories: p.territories,
  objects: p.objects,
  contacts: p.contacts,
});
export function ProfilesPanel() {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [fresh, setFresh] = useState(false);
  const query = useQuery({
    queryKey: ["admin-profiles", page],
    queryFn: ({ signal }) =>
      trainingApi.adminProfiles({ offset: page * 20 }, signal),
  });
  const detail = useQuery({
    queryKey: ["admin-profile", selected],
    enabled: !!selected,
    queryFn: ({ signal }) => trainingApi.adminProfile(selected!, signal),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-profiles"] });
    void client.invalidateQueries({ queryKey: ["admin-profile"] });
    void client.invalidateQueries({ queryKey: ["profiles"] });
  };
  const publish = useMutation({
    mutationFn: (id: string) => trainingApi.publishProfile(id),
    onSuccess: refresh,
  });
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h6">
        Профили служб ДДС
      </Typography>
      <Alert severity="info">
        Администратор готовит и публикует профиль. Преподаватель выбирает его
        при создании сценария ДДС. Новая версия не изменяет назначенные уроки.
      </Alert>
      <Button onClick={() => setFresh(true)}>Создать профиль службы</Button>
      {publish.error && (
        <Alert severity="error">{getApiError(publish.error).message}</Alert>
      )}
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <Table aria-label="Профили служб">
              <TableHead>
                <TableRow>
                  <TableCell>Профиль</TableCell>
                  <TableCell>Версия</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Button
                        className="table-block-link"
                        onClick={() => setSelected(p.id)}
                      >
                        {p.name}
                      </Button>
                    </TableCell>
                    <TableCell>{p.version}</TableCell>
                    <TableCell>
                      {p.status === "published" ? "Опубликован" : "Черновик"}
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={p.status !== "draft" || publish.isPending}
                        onClick={() => publish.mutate(p.id)}
                      >
                        Опубликовать профиль
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PageControls
              total={query.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
      <Dialog
        open={fresh || !!selected}
        onClose={() => {
          setFresh(false);
          setSelected(undefined);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {fresh ? "Новый профиль службы" : "Профиль службы"}
        </DialogTitle>
        <DialogContent>
          {fresh ? (
            <ProfileForm
              initial={empty}
              onSaved={() => {
                setFresh(false);
                refresh();
              }}
            />
          ) : (
            <QueryState
              pending={detail.isPending}
              error={detail.error}
              retry={() => void detail.refetch()}
            >
              {detail.data && (
                <ProfileForm
                  key={`${detail.data.id}-${detail.data.revision}`}
                  initial={input(detail.data)}
                  existing={detail.data}
                  onSaved={() => {
                    setSelected(undefined);
                    refresh();
                  }}
                />
              )}
            </QueryState>
          )}
          <Button
            onClick={() => {
              setFresh(false);
              setSelected(undefined);
            }}
          >
            Закрыть профиль
          </Button>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
function ProfileForm({
  initial,
  existing,
  onSaved,
}: {
  initial: ProfileInput;
  existing?: ServiceProfile;
  onSaved: () => void;
}) {
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
      sx={{ pt: 1 }}
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
        <Paper key={i} sx={{ p: 1 }}>
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
        <Paper key={i} sx={{ p: 1 }}>
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
        <Paper key={i} sx={{ p: 1 }}>
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
        Контакты предназначены для локального учебного контура. Звонки пока не
        подключены.
      </small>
      {save.error && (
        <Alert severity="error">{getApiError(save.error).message}</Alert>
      )}
      <Button type="submit" disabled={!form.service_id || save.isPending}>
        {published ? "Сохранить новую версию профиля" : "Сохранить профиль"}
      </Button>
    </Stack>
  );
}
