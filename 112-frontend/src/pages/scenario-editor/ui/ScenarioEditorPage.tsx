import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm, ValidationField } from "@/shared/ui/form-validation";
import { scenarioApi, type ScenarioInput } from "@/entities/training";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { Alert, Button, MenuItem, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useScenarioEditor } from "../model/useScenarioEditor";
import type { EditorProps } from "../types/ScenarioEditorPage";
import { AssessmentPolicyFields } from "./AssessmentPolicyFields";
import { ScenarioCardsFields } from "./ScenarioCardsFields";
import { ScenarioDdsSettings } from "./ScenarioDdsSettings";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { ScenarioMetadataFields } from "./ScenarioMetadataFields";

export const ScenarioEditorPage = () => {
  const { scenarioId } = useParams();
  const query = useQuery({
    queryKey: ["scenario", scenarioId],
    queryFn: ({ signal }) => scenarioApi.get(scenarioId!, signal),
    enabled: !!scenarioId,
  });
  return (
    <Stack spacing={2}>
      <PageHeader
        title={scenarioId ? "Редактирование сценария" : "Новый сценарий"}
      />
      {scenarioId ? (
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          {query.data && <Editor key={query.data.id} initial={query.data} />}
        </QueryState>
      ) : (
        <Editor />
      )}
    </Stack>
  );
};

function Editor({ initial }: EditorProps) {
  const {
    form,
    profile,
    schedule,
    save,
    setForm,
    setProfile,
    validate,
    submit,
    selectionChange,
    confirmSelectionChange,
    cancelSelectionChange,
  } = useScenarioEditor({ initial });
  return (
    <ValidatedForm
      error={save.error}
      validate={validate}
      spacing={2}
      onSubmit={submit}
    >
      {initial && (
        <Alert severity="info">
          Сохранится новая версия. Уже назначенные занятия сохраняют прежние
          условия.
        </Alert>
      )}
      <ConfirmDialog
        open={!!selectionChange}
        title="Изменить настройки сценария?"
        description="При смене роли или профиля службы список выбранных карточек и расписание очистятся. Остальные поля сохранятся."
        confirmLabel="Изменить"
        onConfirm={confirmSelectionChange}
        onCancel={cancelSelectionChange}
      />
      <TextField
        name="role"
        select
        required
        label="Учебная роль"
        value={form.role}
        helperText="Сначала выберите, для какого оператора создаётся сценарий."
        onChange={(event) =>
          setForm({
            ...form,
            role: event.target.value as ScenarioInput["role"],
          })
        }
      >
        <MenuItem value="operator_112">Оператор 112</MenuItem>
        <MenuItem value="dds">Диспетчер ДДС</MenuItem>
      </TextField>
      {form.role === "dds" && (
        <ScenarioDdsSettings profile={profile} onProfileChange={setProfile} />
      )}
      {(form.role === "operator_112" || (form.role === "dds" && profile)) && (
        <>
          <ScenarioMetadataFields form={form} onChange={setForm} />
          <TextField
            name="instructions"
            label="Инструкция ученику"
            helperText="Общие требования ко всем карточкам сценария. Не повторяйте условия отдельных карточек и памятку службы; если дополнительных требований нет, оставьте поле пустым."
            multiline
            minRows={3}
            value={form.instructions}
            onChange={(event) =>
              setForm({ ...form, instructions: event.target.value })
            }
          />
          <ValidationField
            name="card_ids"
            label="Карточки сценария"
            validate={() =>
              !schedule.cards.length
                ? "Добавьте хотя бы одну карточку в сценарий."
                : undefined
            }
          >
            <ValidationField
              name="arrival_offsets_seconds"
              label="Расписание карточек"
            >
              <ScenarioCardsFields
                role={form.role}
                profileId={profile?.id}
                cards={schedule.cards}
                delays={schedule.delays}
                offsets={schedule.offsets}
                onAdd={schedule.add}
                onRemove={schedule.remove}
                onMove={schedule.move}
                onDelayChange={schedule.changeDelay}
              />
            </ValidationField>
          </ValidationField>
          <TextField
            name="status"
            select
            label="Статус публикации"
            value={form.status}
            onChange={(event) =>
              setForm({
                ...form,
                status: event.target.value as ScenarioInput["status"],
              })
            }
          >
            <MenuItem value="draft">Черновик</MenuItem>
            <MenuItem value="published">Опубликован</MenuItem>
          </TextField>
          {form.role === "dds" ? (
            <Alert severity="info">
              Автооценка ДДС проверяет статусы по сообщениям и заданные номера
              нарядов. Если заданы цели бригад, их выполнение учитывается
              отдельно, независимо от порядка работы разных бригад. Итог
              приводится к 100%. Смысл комментариев проверяется ИИ с
              возможностью проверки преподавателем. Норматив первой реакции
              отражается отдельно, без автоматического штрафа.
            </Alert>
          ) : (
            <AssessmentPolicyFields
              value={form.assessment_policy!}
              onChange={(assessment_policy) =>
                setForm({ ...form, assessment_policy })
              }
            />
          )}
          <Button type="submit" variant="contained" disabled={save.isPending}>
            Сохранить сценарий
          </Button>
        </>
      )}
    </ValidatedForm>
  );
}
