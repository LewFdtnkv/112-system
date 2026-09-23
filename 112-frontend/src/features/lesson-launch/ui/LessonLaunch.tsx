import { trainingApi, userName } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { randomUUID } from "@/shared/lib/uuid";
import { DateTimeField } from "@/shared/ui/DateTimeField";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { styles } from "../styles/LessonLaunch";
import { useLessonLaunch } from "../model/useLessonLaunch";
import { LearningSettings } from "./LearningSettings";
import { LearningSummary } from "@/entities/training";

export function LessonLaunch() {
  const {
    scenarioRole,
    group,
    setGroup,
    targets,
    setTargets,
    from,
    setFrom,
    until,
    setUntil,
    confirm,
    setConfirm,
    student,
    setStudent,
    scenario,
    setScenario,
    learning,
    setLearning,
    learningValid,
    limit,
    setLimit,
    title,
    setTitle,
    setRequestId,
    mutation,
  } = useLessonLaunch();
  return (
    <Stack
      component="form"
      spacing={2}
      onChange={() => setRequestId(randomUUID())}
      onSubmit={(e) => {
        e.preventDefault();
        if (learningValid) setConfirm(true);
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
          setLearning({ ...learning, target_skills: [] });
          setRequestId(randomUUID());
        }}
        load={async (q, signal) =>
          (
            await trainingApi.scenarios({ q, status: "published" }, signal)
          ).items.map((item) => ({
            id: item.id,
            metadata: { role: item.role },
            label: `${item.title} · версия ${item.version}${item.role === "dds" ? " · ДДС" : ""}`,
          }))
        }
      />
      <TextField
        label="Название задания (необязательно)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <DateTimeField
        label="Дата и время начала"
        value={from}
        onChange={(value) => {
          setFrom(value);
          setRequestId(randomUUID());
        }}
        helperText="Пусто — доступно сразу. Время вашего браузера."
      />
      <DateTimeField
        label="Дата и время окончания"
        value={until}
        min={from || undefined}
        onChange={(value) => {
          setUntil(value);
          setRequestId(randomUUID());
        }}
        helperText="Пусто — без общей даты окончания. По окончании срока непройденные карточки учитываются как 0."
      />
      <LearningSettings
        value={learning}
        onChange={setLearning}
        role={scenarioRole}
      />
      <TextField
        label="Лимит времени на карточку, с (необязательно)"
        type="number"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        slotProps={{ htmlInput: { min: 1, max: 86400 } }}
      />
      {mutation.error && (
        <Alert severity="error">{getApiError(mutation.error).message}</Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={
          (!group && !targets.length) ||
          !scenario ||
          !learningValid ||
          mutation.isPending
        }
      >
        Назначить задание
      </Button>
      <Dialog open={confirm} onClose={() => setConfirm(false)} fullWidth>
        <DialogTitle>Назначить задание?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <LearningSummary policy={learning} />
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
              disabled={mutation.isPending || !learningValid}
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
