import { trainingApi, userName } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { getTrainingSessionPath } from "@/shared/config/routes";
import { randomUUID } from "@/shared/lib/uuid";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { styles } from "../styles/LessonLaunch";
export function LessonLaunch() {
  const [params] = useSearchParams();
  const [group, setGroup] = useState<SelectOption | null>(() =>
    params.get("group")
      ? { id: params.get("group")!, label: "Выбранная группа" }
      : null,
  );
  const [targets, setTargets] = useState<
    { id: string; label: string; kind: "group" | "student" }[]
  >([]);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [student, setStudent] = useState<SelectOption | null>(null);
  const [scenario, setScenario] = useState<SelectOption | null>(() =>
    params.get("scenario")
      ? {
          id: params.get("scenario")!,
          label: params.get("title") ?? "Выбранный сценарий",
        }
      : null,
  );
  const [mode, setMode] = useState("practice");
  const [limit, setLimit] = useState("");
  const [hint, setHint] = useState("");
  const [title, setTitle] = useState("");
  const [requestId, setRequestId] = useState(() => randomUUID());
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () =>
      trainingApi.startLesson({
        request_id: requestId,
        ...(targets.length
          ? {
              group_ids: targets
                .filter((t) => t.kind === "group")
                .map((t) => t.id),
              student_ids: targets
                .filter((t) => t.kind === "student")
                .map((t) => t.id),
            }
          : { group_id: group!.id }),
        ...(from ? { available_from: new Date(from).toISOString() } : {}),
        ...(until ? { available_until: new Date(until).toISOString() } : {}),
        scenario_version_id: scenario!.id,
        mode,
        ...(!targets.length && student ? { student_id: student.id } : {}),
        ...(title.trim() ? { title } : {}),
        ...(limit ? { time_limit_seconds: Number(limit) } : {}),
        ...(hint ? { hint_delay_seconds: Number(hint) } : {}),
      }),
    onSuccess: (lesson) => {
      void client.invalidateQueries({ queryKey: ["lessons"] });
      navigate(getTrainingSessionPath(lesson.id));
    },
  });
  return (
    <Stack
      component="form"
      spacing={2}
      onChange={() => setRequestId(randomUUID())}
      onSubmit={(e) => {
        e.preventDefault();
        setConfirm(true);
      }}
    >
      <h2>Назначить задание</h2>
      <ServerSelect
        label="Группа"
        queryKey={["group-options"]}
        value={group}
        onChange={(v) => {
          setGroup(v);
          setStudent(null);
          setRequestId(randomUUID());
        }}
        load={async (q, signal) =>
          (await trainingApi.groups({ q }, signal)).items.map((item) => ({
            id: item.id,
            label: `${item.name} (${item.student_count})`,
          }))
        }
      />
      <ServerSelect
        label="Ученик (пусто — вся группа)"
        queryKey={["group-students", group?.id]}
        disabled={!group}
        value={student}
        onChange={(v) => {
          setStudent(v);
          setRequestId(randomUUID());
        }}
        load={async (q, signal) =>
          (
            await trainingApi.users(
              { q, group_id: group!.id, role: "student" },
              signal,
            )
          ).items.map((item) => ({ id: item.id, label: userName(item) }))
        }
      />
      <Button
        disabled={!group}
        onClick={() => {
          const value = student ?? group!;
          const kind = student ? "student" : "group";
          setTargets((previous) =>
            previous.some((t) => t.id === value.id && t.kind === kind)
              ? previous
              : [...previous, { ...value, kind }],
          );
          setRequestId(randomUUID());
        }}
      >
        Добавить выбранную группу / ученика в получатели
      </Button>
      <Stack direction="row" sx={styles.stack}>
        {targets.map((t) => (
          <Chip
            key={`${t.kind}:${t.id}`}
            label={`${t.kind === "group" ? "Группа" : "Ученик"}: ${t.label}`}
            onDelete={() => {
              setTargets(targets.filter((v) => v !== t));
              setRequestId(randomUUID());
            }}
          />
        ))}
      </Stack>
      {targets.length > 0 && (
        <Alert severity="info">
          Задание получат все отмеченные группы и ученики. Повторяющиеся ученики
          получат одно назначение.
        </Alert>
      )}
      <ServerSelect
        label="Готовый сценарий"
        queryKey={["scenario-options"]}
        value={scenario}
        onChange={(v) => {
          setScenario(v);
          setRequestId(randomUUID());
        }}
        load={async (q, signal) =>
          (
            await trainingApi.scenarios({ q, status: "published" }, signal)
          ).items.map((item) => ({
            id: item.id,
            label: `${item.title} · версия ${item.version}${item.role === "dds" ? " · ДДС" : ""}`,
          }))
        }
      />
      <TextField
        label="Название задания (необязательно)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextField
        label="Дата и время начала"
        type="datetime-local"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        helperText="Пусто — доступно сразу. Время вашего браузера."
      />
      <TextField
        label="Дата и время окончания"
        type="datetime-local"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: { min: from || undefined },
        }}
        helperText="По окончании срока изменения запрещаются, непройденные карточки учитываются как 0."
      />
      <TextField
        select
        label="Режим"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <MenuItem value="introduction">Знакомство с интерфейсом</MenuItem>
        <MenuItem value="practice">Практика</MenuItem>
        <MenuItem value="assessment">Проверка знаний</MenuItem>
      </TextField>
      <TextField
        label="Лимит времени на карточку, с (необязательно)"
        type="number"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        slotProps={{ htmlInput: { min: 1, max: 86400 } }}
      />
      <TextField
        label="Задержка подсказки, с (необязательно)"
        type="number"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        slotProps={{ htmlInput: { min: 1, max: 86400 } }}
        helperText="Настройка сохраняется; автоматические подсказки пока не подключены."
      />
      {mutation.error && (
        <Alert severity="error">{getApiError(mutation.error).message}</Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={
          (!group && !targets.length) || !scenario || mutation.isPending
        }
      >
        Назначить задание
      </Button>
      <Dialog open={confirm} onClose={() => setConfirm(false)} fullWidth>
        <DialogTitle>Назначить задание?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <p>
              {scenario?.label} →{" "}
              {targets.length
                ? targets.map((t) => t.label).join(", ")
                : (student?.label ?? group?.label)}
            </p>
            <p>
              Начало: {from || "Сразу"}. Окончание:{" "}
              {until || "Без общей даты окончания"}.
            </p>
            {mutation.error && (
              <Alert severity="error">
                {getApiError(mutation.error).message}
              </Alert>
            )}
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Подтвердить назначение
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => setConfirm(false)}
            >
              Отмена
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
