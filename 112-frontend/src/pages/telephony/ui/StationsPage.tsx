import { useForm, useWatch } from "react-hook-form";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { stationModeLabels } from "@/entities/telephony";
import type { StationInput } from "@/entities/telephony";
import { PageHeader } from "@/shared/ui/PageHeader";
import { getApiError } from "@/shared/api";
import { useStations } from "../model/useStations";
import "../styles/telephony.scss";
export function StationsPage() {
  const { stations, students, create, update, credentials } = useStations();
  const form = useForm<StationInput>({
    defaultValues: {
      name: "",
      mode: "browser",
      endpoint: "",
      provider: "local",
      student_id: null,
    },
  });
  const mode = useWatch({ control: form.control, name: "mode" });
  const studentId = useWatch({ control: form.control, name: "student_id" });
  const error =
    stations.error ||
    create.error ||
    update.error ||
    credentials.error ||
    students.error;
  return (
    <Stack spacing={2} className="telephony-page">
      <PageHeader title="Телефонные рабочие места" />
      <Typography>
        Закрепите за учеником аппарат или браузерную гарнитуру. Во время занятия
        телефон связывается с открытой карточкой.
      </Typography>
      {error && <Alert severity="error">{getApiError(error).message}</Alert>}
      <form
        className="telephony-page__form"
        onSubmit={form.handleSubmit((data) => {
          create.mutate(
            {
              ...data,
              provider: data.mode === "external" ? data.provider : "local",
              student_id: data.student_id || null,
            },
            { onSuccess: () => form.reset() },
          );
        })}
      >
        <TextField
          label="Название рабочего места"
          required
          {...form.register("name")}
        />
        <TextField
          label="Подключение"
          select
          value={mode}
          {...form.register("mode")}
        >
          {Object.entries(stationModeLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="SIP-логин / ID телефона"
          required
          helperText="Латиница, цифры, дефис или подчёркивание"
          slotProps={{
            htmlInput: { pattern: "[A-Za-z0-9_][A-Za-z0-9_-]{0,63}" },
          }}
          {...form.register("endpoint")}
        />
        {mode === "external" && (
          <TextField
            label="Код адаптера АТС"
            required
            {...form.register("provider")}
          />
        )}
        <TextField
          select
          label="Ученик"
          value={studentId ?? ""}
          {...form.register("student_id")}
        >
          <MenuItem value="">Не назначен</MenuItem>
          {students.data?.items.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.last_name} {s.first_name} ({s.username})
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" disabled={create.isPending}>
          Добавить рабочее место
        </Button>
      </form>
      <div className="telephony-page__table">
        <table>
          <thead>
            <tr>
              <th>Рабочее место</th>
              <th>Подключение</th>
              <th>Ученик</th>
              <th>Состояние</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {stations.data?.map((station) => (
              <tr key={station.id}>
                <td>
                  <b>{station.name}</b>
                  <br />
                  {station.endpoint}
                </td>
                <td>{stationModeLabels[station.mode]}</td>
                <td>
                  <TextField
                    select
                    size="small"
                    aria-label={`Ученик ${station.name}`}
                    slotProps={{ select: { displayEmpty: true } }}
                    value={station.student_id ?? ""}
                    disabled={update.isPending}
                    onChange={(event) =>
                      update.mutate({
                        id: station.id,
                        student_id: event.target.value || null,
                        enabled: station.enabled,
                      })
                    }
                  >
                    <MenuItem value="">Не назначен</MenuItem>
                    {students.data?.items.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.last_name} {s.first_name} ({s.username})
                      </MenuItem>
                    ))}
                  </TextField>
                </td>
                <td>
                  {!station.enabled
                    ? "Отключено"
                    : station.mode === "external"
                      ? "Внешний адаптер"
                      : station.provisioned
                        ? "Настроено"
                        : station.error || "Настраивается"}
                </td>
                <td>
                  <Button
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        id: station.id,
                        student_id: station.student_id,
                        enabled: !station.enabled,
                      })
                    }
                  >
                    {station.enabled ? "Отключить" : "Включить"}
                  </Button>
                  {station.mode !== "external" && (
                    <Button
                      disabled={credentials.isPending}
                      onClick={() => credentials.mutate(station.id)}
                    >
                      Настройки SIP
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stations.data?.length === 0 && (
        <Typography>Рабочих мест пока нет.</Typography>
      )}
      <Dialog open={!!credentials.data} onClose={() => credentials.reset()}>
        <DialogTitle>Подключение учебного телефона</DialogTitle>
        <DialogContent>
          {credentials.data && (
            <Stack spacing={1}>
              <Typography>Сервер: {credentials.data.domain}</Typography>
              <Typography>Логин: {credentials.data.username}</Typography>
              <Typography className="telephony-page__secret">
                Пароль: {credentials.data.password}
              </Typography>
              <Typography>
                Порт: 5060 / UDP. Учебный номер: 9000. В браузере настройки
                применяются автоматически.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => credentials.reset()}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
