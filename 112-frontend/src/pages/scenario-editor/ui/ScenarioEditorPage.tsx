import { trainingApi, type ScenarioInput } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useScenarioCards } from "../model/useScenarioCards";
import { styles } from "../styles/ScenarioEditorPage";
import type { EditorProps } from "../types/ScenarioEditorPage";
import { AssessmentPolicyFields } from "./AssessmentPolicyFields";
import { DDSPolicyFields } from "./DDSPolicyFields";
export const ScenarioEditorPage = () => {
  const { scenarioId } = useParams();
  const query = useQuery({
    queryKey: ["scenario", scenarioId],
    queryFn: ({ signal }) => trainingApi.scenario(scenarioId!, signal),
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
      steps: [{ status: "accepted", message: "", crew_number: null }],
    },
  }));
  const schedule = useScenarioCards(initial);
  const { cards, choice, setChoice, move } = schedule;
  const [profile, setProfile] = useState<SelectOption | null>(() =>
    initial?.service_profile_id
      ? { id: initial.service_profile_id, label: "Назначенный профиль ДДС" }
      : null,
  );
  const save = useMutation({
    mutationFn: () =>
      trainingApi.saveScenario(
        {
          ...form,
          card_ids: cards.map((c) => c.id),
          arrival_offsets_seconds:
            form.role === "dds" ? schedule.offsets : cards.map(() => 0),
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
    <Stack
      component="form"
      spacing={2}
      onSubmit={(e) => {
        e.preventDefault();
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
      <TextField
        label="Название сценария"
        required
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <TextField
        label="Категория"
        value={form.category}
        onChange={(e) => setForm({ ...form, category: e.target.value })}
      />
      <Stack direction="row" sx={styles.metadata}>
        <TextField
          select
          label="Сложность"
          value={form.difficulty}
          onChange={(e) =>
            setForm({
              ...form,
              difficulty: e.target.value as ScenarioInput["difficulty"],
            })
          }
        >
          <MenuItem value="basic">Базовый</MenuItem>
          <MenuItem value="intermediate">Средний</MenuItem>
          <MenuItem value="advanced">Сложный</MenuItem>
        </TextField>
        <TextField
          type="number"
          label="Длительность, мин"
          slotProps={{ htmlInput: { min: 1, max: 120 } }}
          value={form.duration_minutes}
          onChange={(e) =>
            setForm({ ...form, duration_minutes: Number(e.target.value) })
          }
        />
        <TextField
          type="number"
          label={
            form.role === "dds"
              ? "Норматив первой реакции, с"
              : "Учебный ориентир, с"
          }
          helperText={
            form.role === "dds"
              ? "От поступления до первого ручного статуса бригады. Без автоматического штрафа."
              : "Для таймера, не автоматической оценки"
          }
          slotProps={{ htmlInput: { min: 5, max: 600 } }}
          value={form.norm_seconds}
          onChange={(e) =>
            setForm({ ...form, norm_seconds: Number(e.target.value) })
          }
        />
      </Stack>
      <TextField
        select
        label="Учебная роль"
        value={form.role}
        onChange={(e) =>
          setForm({ ...form, role: e.target.value as ScenarioInput["role"] })
        }
      >
        <MenuItem value="operator_112">Оператор 112</MenuItem>
        <MenuItem value="dds">Диспетчер ДДС</MenuItem>
      </TextField>
      {form.role === "dds" && (
        <>
          <Alert severity="warning">
            Выберите опубликованный профиль и задайте сообщения и ожидаемые
            действия ДДС. Аудио звонков подготовьте в разделе «Записи звонков».
          </Alert>
          <DDSPolicyFields
            profileId={profile?.id}
            value={form.dds_policy!}
            onChange={(dds_policy) => setForm({ ...form, dds_policy })}
          />
          <ServerSelect
            label="Профиль службы"
            queryKey={["profiles"]}
            value={profile}
            onChange={(next) => {
              setProfile(next);
              setForm({
                ...form,
                dds_policy: { ...form.dds_policy!, required_crews: [] },
              });
            }}
            load={async (q, signal) =>
              (await trainingApi.profiles(q, signal)).map((p) => ({
                id: p.id,
                label: p.name,
              }))
            }
          />
        </>
      )}
      <TextField
        label="Инструкция ученику"
        multiline
        minRows={3}
        value={form.instructions}
        onChange={(e) => setForm({ ...form, instructions: e.target.value })}
      />
      <Typography variant="h6" component="h2">
        {form.role === "dds"
          ? "Расписание поступления карточек"
          : "Карточки по порядку выполнения"}
      </Typography>
      <ServerSelect
        label="Карточка из библиотеки"
        queryKey={["card-options"]}
        value={choice}
        onChange={setChoice}
        load={async (q, signal) =>
          (await trainingApi.cards({ q }, signal)).items.map((c) => ({
            id: c.id,
            label: c.title,
          }))
        }
      />
      <Button
        disabled={!choice || cards.length >= 100}
        onClick={() => {
          schedule.add();
        }}
      >
        Добавить карточку
      </Button>
      {cards.map((c, i) => (
        <Paper key={i} sx={styles.paper}>
          <Stack direction="row" sx={styles.stack} spacing={1}>
            <Typography sx={styles.typography}>
              {i + 1}. {c.label}
            </Typography>
            <Button
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Вверх: ${c.label}`}
            >
              ↑
            </Button>
            <Button
              disabled={i === cards.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Вниз: ${c.label}`}
            >
              ↓
            </Button>
            <Button onClick={() => schedule.remove(i)}>Убрать</Button>
          </Stack>
          {form.role === "dds" && (
            <TextField
              type="number"
              label={
                i === 0
                  ? "Первая карточка — сразу"
                  : "Через сколько секунд после предыдущей"
              }
              value={schedule.delays[i]}
              disabled={i === 0}
              slotProps={{ htmlInput: { min: 0, max: 86400, step: 1 } }}
              onChange={(e) => schedule.changeDelay(i, Number(e.target.value))}
              helperText={`Поступление через ${schedule.offsets[i]} с от старта занятия. Завершение предыдущей карточки не требуется.`}
            />
          )}
        </Paper>
      ))}
      <TextField
        select
        label="Статус публикации"
        value={form.status}
        onChange={(e) =>
          setForm({
            ...form,
            status: e.target.value as ScenarioInput["status"],
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
      {save.error && (
        <Alert severity="error">{getApiError(save.error).message}</Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={
          save.isPending || !cards.length || (form.role === "dds" && !profile)
        }
      >
        Сохранить сценарий
      </Button>
    </Stack>
  );
}
