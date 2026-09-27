import { userKeys } from "@/entities/user";
import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm } from "@/shared/ui/form-validation";
import { scenarioApi, scenarioDifficultyLabel } from "@/entities/training";
import { userApi, userName } from "@/entities/user";
import { getApiError } from "@/shared/api";
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
} from "@mui/material";
import { styles } from "../styles/LessonLaunch";
import { useLessonLaunch } from "../model/useLessonLaunch";
import { LearningSettings } from "./LearningSettings";
import { LearningSummary } from "@/entities/training";

export function LessonLaunch() {
  const {
    scenarioRole,
    difficultyLabel,
    group,
    setGroup,
    targets,
    addTarget,
    removeTarget,
    validate,
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

    mutation,
  } = useLessonLaunch();
  return (
    <ValidatedForm
      error={mutation.error}
      validate={validate}
      spacing={2}
      onSubmit={(e) => {
        e.preventDefault();
        if (learningValid) setConfirm(true);
      }}
    >
      <h2>Назначить задание</h2>
      <ServerSelect
        name="group_id"
        required={!targets.length}
        label="Группа"
        queryKey={userKeys.groupOptions}
        value={group}
        onChange={setGroup}
        load={async (q, signal) =>
          (await userApi.groups({ q }, signal)).items.map((item) => ({
            id: item.id,
            label: `${item.name} (${item.student_count})`,
          }))
        }
      />
      <ServerSelect
        label="Ученик (пусто — вся группа)"
        queryKey={[...userKeys.groupStudents, group?.id]}
        disabled={!group}
        value={student}
        onChange={setStudent}
        load={async (q, signal) =>
          (
            await userApi.users(
              { q, group_id: group!.id, role: "student" },
              signal,
            )
          ).items.map((item) => ({ id: item.id, label: userName(item) }))
        }
      />
      <Button disabled={!group} onClick={addTarget}>
        Добавить выбранную группу / ученика в получатели
      </Button>
      <Stack direction="row" sx={styles.stack}>
        {targets.map((t) => (
          <Chip
            key={`${t.kind}:${t.id}`}
            label={`${t.kind === "group" ? "Группа" : "Ученик"}: ${t.label}`}
            onDelete={() => removeTarget(t.id, t.kind)}
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
        name="scenario_version_id"
        required
        label="Готовый сценарий"
        queryKey={["scenario-options"]}
        value={scenario}
        onChange={setScenario}
        load={async (q, signal) =>
          (
            await scenarioApi.list({ q, status: "published" }, signal)
          ).items.map((item) => ({
            id: item.id,
            metadata: { role: item.role, difficulty: item.difficulty },
            label: `${item.title} · версия ${item.version}${item.role === "dds" ? " · ДДС" : ""} · сложность: ${scenarioDifficultyLabel(item.difficulty)}`,
          }))
        }
      />
      {scenario && (
        <Chip
          label={`Уровень сложности: ${difficultyLabel}`}
          sx={styles.difficulty}
        />
      )}
      <TextField
        name="title"
        label="Название задания (необязательно)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <DateTimeField
        name="available_from"
        label="Дата и время начала"
        value={from}
        onChange={setFrom}
        helperText="Пусто — доступно сразу. Время вашего браузера."
      />
      <DateTimeField
        name="available_until"
        label="Дата и время окончания"
        value={until}
        min={from || undefined}
        onChange={setUntil}
        helperText="Пусто — без общей даты окончания. По окончании срока непройденные карточки учитываются как 0."
      />
      <LearningSettings
        value={learning}
        onChange={setLearning}
        role={scenarioRole}
      />
      <TextField
        name="time_limit_seconds"
        label="Время на занятие, минут (необязательно)"
        type="number"
        helperText="Пусто — можно делать паузы. С лимитом время идёт с начала занятия, в том числе после выхода."
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        slotProps={{ htmlInput: { min: 1, max: 1440 } }}
      />
      <Button type="submit" variant="contained" disabled={mutation.isPending}>
        Назначить задание
      </Button>
      <Dialog open={confirm} onClose={() => setConfirm(false)} fullWidth>
        <DialogTitle>Назначить задание?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <LearningSummary policy={learning} />
            <Chip
              label={`Уровень сложности: ${difficultyLabel}`}
              sx={styles.difficulty}
            />
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
            <p>
              Время на занятие:{" "}
              {limit
                ? `${limit} мин с начала выполнения`
                : "Без лимита, с паузами"}
              .
            </p>
            {mutation.error && (
              <Alert severity="error">
                {getApiError(mutation.error).message}
              </Alert>
            )}
            <Button
              disabled={mutation.isPending || !learningValid}
              onClick={() =>
                mutation.mutate(undefined, { onError: () => setConfirm(false) })
              }
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
    </ValidatedForm>
  );
}
