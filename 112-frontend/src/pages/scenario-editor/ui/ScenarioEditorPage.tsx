import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm, ValidationField } from "@/shared/ui/form-validation";
import { scenarioApi, type ScenarioInput } from "@/entities/training";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { type SelectOption } from "@/shared/ui/ServerSelect";
import { Alert, Button, MenuItem, Stack } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useScenarioCards } from "../model/useScenarioCards";
import type { EditorProps } from "../types/ScenarioEditorPage";
import { AssessmentPolicyFields } from "./AssessmentPolicyFields";
import { ScenarioCardsFields } from "./ScenarioCardsFields";
import { ScenarioDdsSettings } from "./ScenarioDdsSettings";
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
  const navigate = useNavigate();
  const client = useQueryClient();
  const [form, setForm] = useState<ScenarioInput>(() => ({
    title: initial?.title ?? "",
    assessment_policy: initial?.assessment_policy ?? {
      version: "weighted-fields-v1",
      weights: {
        classification: 25,
        notification: 25,
        address: 30,
        caller: 10,
        victims: 10,
      },
    },
    category: initial?.category ?? "",
    difficulty: initial?.difficulty ?? "basic",
    duration_minutes: initial?.duration_minutes ?? 15,
    norm_seconds: initial?.norm_seconds ?? 30,
    instructions: initial?.instructions ?? "",
    status: initial?.status ?? "draft",
    role: initial?.role ?? "operator_112",
    card_ids: [],
    service_profile_id: initial?.service_profile_id ?? null,
    dds_policy: initial?.dds_policy ?? {
      workflow: "crews-v1",
      crew_calls_required: true,
      steps: [{ status: "accepted", message: "", crew_number: null }],
    },
  }));
  const schedule = useScenarioCards(initial);
  const [profile, setProfile] = useState<SelectOption | null>(() =>
    initial?.service_profile_id
      ? { id: initial.service_profile_id, label: "Назначенный профиль ДДС" }
      : null,
  );
  const save = useMutation({
    mutationFn: () =>
      scenarioApi.save(
        {
          ...form,
          card_ids: schedule.cards.map((card) => card.id),
          arrival_offsets_seconds:
            form.role === "dds"
              ? schedule.offsets
              : schedule.cards.map(() => 0),
          dds_policy: form.role === "dds" ? form.dds_policy : null,
          service_profile_id:
            form.role === "dds" ? (profile?.id ?? null) : null,
        },
        initial?.id,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["scenarios"] });
      void client.invalidateQueries({ queryKey: ["scenario-options"] });
      navigate(routePaths.scenarios);
    },
  });
  return (
    <ValidatedForm
      error={save.error}
      spacing={2}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !initial ||
          window.confirm(
            "Сохранить новую версию сценария? Назначенные задания сохранят прежнюю версию.",
          )
        )
          save.mutate();
      }}
    >
      {initial && (
        <Alert severity="info">
          Сохранится новая версия. Уже назначенные занятия сохраняют прежние
          условия.
        </Alert>
      )}
      <ScenarioMetadataFields form={form} onChange={setForm} />
      {form.role === "dds" && (
        <ScenarioDdsSettings
          form={form}
          profile={profile}
          onChange={setForm}
          onProfileChange={setProfile}
        />
      )}
      <TextField
        name="instructions"
        label="Инструкция ученику"
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
        <ScenarioCardsFields
          role={form.role}
          cards={schedule.cards}
          choice={schedule.choice}
          delays={schedule.delays}
          offsets={schedule.offsets}
          onChoiceChange={schedule.setChoice}
          onAdd={schedule.add}
          onRemove={schedule.remove}
          onMove={schedule.move}
          onDelayChange={schedule.changeDelay}
        />
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
          нарядов. Если заданы цели бригад, их выполнение учитывается отдельно,
          независимо от порядка работы разных бригад. Итог приводится к 100%.
          Смысл комментариев проверяется ИИ с возможностью проверки
          преподавателем. Норматив первой реакции отражается отдельно, без
          автоматического штрафа.
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
    </ValidatedForm>
  );
}
