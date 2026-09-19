import { useState } from "react";
import { Alert, Button, MenuItem, Stack, TextField } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { trainingApi, userName } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { getTrainingSessionPath } from "@/shared/config/routes";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
export function LessonLaunch() {
  const [group, setGroup] = useState<SelectOption | null>(null);
  const [student, setStudent] = useState<SelectOption | null>(null);
  const [scenario, setScenario] = useState<SelectOption | null>(null);
  const [mode, setMode] = useState("practice");
  const [limit, setLimit] = useState("");
  const [hint, setHint] = useState("");
  const [title, setTitle] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () =>
      trainingApi.startLesson({
        request_id: requestId,
        group_id: group!.id,
        scenario_version_id: scenario!.id,
        mode,
        ...(student ? { student_id: student.id } : {}),
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
      onChange={() => setRequestId(crypto.randomUUID())}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2>Запустить занятие</h2>
      <ServerSelect
        label="Группа"
        queryKey={["group-options"]}
        value={group}
        onChange={(v) => {
          setGroup(v);
          setStudent(null);
          setRequestId(crypto.randomUUID());
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
          setRequestId(crypto.randomUUID());
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
      <ServerSelect
        label="Готовый сценарий"
        queryKey={["scenario-options"]}
        value={scenario}
        onChange={(v) => {
          setScenario(v);
          setRequestId(crypto.randomUUID());
        }}
        load={async (q, signal) =>
          (
            await trainingApi.scenarios({ q, status: "published" }, signal)
          ).items.map((item) => ({
            id: item.id,
            label: `${item.title} · версия ${item.version}${item.role === "dds" ? " · ДДС (выполнение недоступно)" : ""}`,
          }))
        }
      />
      <TextField
        label="Название занятия (необязательно)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
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
        disabled={!group || !scenario || mutation.isPending}
      >
        Запустить урок
      </Button>
    </Stack>
  );
}
