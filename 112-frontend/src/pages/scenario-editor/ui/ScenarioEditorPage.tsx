import { Alert, Stack } from "@mui/material";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  scenariosApi,
  useDemoScenarioStore,
  type ScenarioDraft,
} from "@/entities/scenario";
import { ScenarioForm } from "@/features/scenario-management";
import { routePaths } from "@/shared/config/routes";
import { getApiError } from "@/shared/api";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const ScenarioEditorPage = () => {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const upsertScenario = useDemoScenarioStore((state) => state.upsertScenario);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const navigate = useNavigate();
  const [error, setError] = useState<string>();

  const save = async (draft: ScenarioDraft) => {
    try {
      const saved = scenarioId
        ? await scenariosApi.update(scenarioId, draft)
        : await scenariosApi.create(draft);
      upsertScenario(saved);
    } catch (cause) {
      setError(getApiError(cause).message);
      return;
    }
    navigate(routePaths.scenarios, { state: { scenarioSaved: true } });
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={scenarioId ? "Редактор сценария" : "Новый сценарий"}
        actions={<Link to={routePaths.scenarios}>К сценариям</Link>}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {scenarioId && !scenario ? (
        <EmptyState title="Сценарий не найден" />
      ) : (
        <ScenarioForm
          key={scenarioId ?? "new"}
          initialValues={scenario}
          onSave={save}
        />
      )}
    </Stack>
  );
};
