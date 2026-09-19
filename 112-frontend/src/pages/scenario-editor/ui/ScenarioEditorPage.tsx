import { useState } from "react";
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
import { useNavigate, useParams } from "react-router-dom";
import {
  trainingApi,
  type ScenarioDetail,
  type ScenarioInput,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
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
function Editor({ initial }: { initial?: ScenarioDetail }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [form, setForm] = useState<ScenarioInput>(() => ({
    title: initial?.title ?? "",
    category: initial?.category ?? "",
    difficulty: initial?.difficulty ?? "basic",
    duration_minutes: initial?.duration_minutes ?? 15,
    norm_seconds: initial?.norm_seconds ?? 30,
    instructions: initial?.instructions ?? "",
    status: initial?.status ?? "draft",
    role: initial?.role ?? "operator_112",
    card_ids: [],
    service_profile_id: initial?.service_profile_id ?? null,
  }));
  const [cards, setCards] = useState<SelectOption[]>(
    () =>
      initial?.cards.map((c) => ({
        id: c.card_template_id,
        label: c.snapshot.title,
      })) ?? [],
  );
  const [choice, setChoice] = useState<SelectOption | null>(null);
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
  const move = (index: number, step: number) =>
    setCards((current) => {
      const next = [...current];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(e) => {
        e.preventDefault();
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
      <Stack direction="row" spacing={2}>
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
          label="Учебный ориентир, с"
          helperText="Для таймера, не автоматической оценки"
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
            Сценарий можно подготовить. Выполнение ДДС и SIP-звонки пока
            недоступны.
          </Alert>
          <ServerSelect
            label="Профиль службы"
            queryKey={["profiles"]}
            value={profile}
            onChange={setProfile}
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
        Карточки по порядку выполнения
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
          if (choice) setCards([...cards, choice]);
          setChoice(null);
        }}
      >
        Добавить карточку
      </Button>
      {cards.map((c, i) => (
        <Paper key={i} sx={{ p: 1 }}>
          <Stack direction="row" sx={{ alignItems: "center" }} spacing={1}>
            <Typography sx={{ flex: 1 }}>
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
            <Button onClick={() => setCards(cards.filter((_, n) => n !== i))}>
              Убрать
            </Button>
          </Stack>
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
