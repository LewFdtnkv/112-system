import { useState } from "react";
import {
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { Link } from "react-router-dom";

import { getScorePercent } from "@/entities/evaluation/demoEvaluations";
import { useDemoScenarioStore } from "@/entities/scenario";
import { useDemoTrainingStore } from "@/entities/training-session";
import { getScenarioEditPath } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageSection } from "@/shared/ui/PageSection";
import { CriteriaBreakdownChart } from "@/widgets/criteria-breakdown-chart";
import { ErrorHeatmap } from "@/widgets/error-heatmap";

export const AnalyticsPage = () => {
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const allSessions = useDemoTrainingStore((state) => state.sessions);
  const allEvaluations = useDemoTrainingStore((state) => state.evaluations);
  const [scenarioId, setScenarioId] = useState("all");
  const selectedScenarios = scenarios.filter(
    (scenario) => scenarioId === "all" || scenario.id === scenarioId,
  );
  const sessions = allSessions.filter(
    (session) => scenarioId === "all" || session.scenarioId === scenarioId,
  );
  const evaluations = allEvaluations.filter((result) =>
    sessions.some((session) => session.id === result.sessionId),
  );
  const averageScore = evaluations.length
    ? Math.round(
        evaluations.reduce(
          (total, evaluation) => total + getScorePercent(evaluation),
          0,
        ) / evaluations.length,
      )
    : null;

  return (
    <Stack spacing={2}>
      <PageHeader title="Аналитика" />
      <TextField
        select
        label="Сценарий"
        value={scenarioId}
        onChange={(event) => setScenarioId(event.target.value)}
      >
        <MenuItem value="all">Все сценарии</MenuItem>
        {scenarios.map((scenario) => (
          <MenuItem value={scenario.id} key={scenario.id}>
            {scenario.name}
          </MenuItem>
        ))}
      </TextField>
      <PageSection title="Сводка">
        <dl>
          <dt>Всего занятий</dt>
          <dd>{sessions.length}</dd>
          <dt>Завершено</dt>
          <dd>
            {
              sessions.filter((session) => session.status === "completed")
                .length
            }
          </dd>
          <dt>В процессе</dt>
          <dd>
            {sessions.filter((session) => session.status === "active").length}
          </dd>
          <dt>Средний результат</dt>
          <dd>{averageScore === null ? "Нет оценок" : `${averageScore}%`}</dd>
        </dl>
      </PageSection>
      <PageSection title="Результаты по критериям">
        <CriteriaBreakdownChart evaluations={evaluations} />
      </PageSection>
      <PageSection title="Частые замечания">
        <ErrorHeatmap evaluations={evaluations} />
      </PageSection>
      <TableContainer>
        <Table size="small" aria-label="Статистика по сценариям">
          <TableHead>
            <TableRow>
              <TableCell>Сценарий</TableCell>
              <TableCell>Занятия</TableCell>
              <TableCell>Завершено</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {selectedScenarios.map((scenario) => {
              const scenarioSessions = sessions.filter(
                (session) => session.scenarioId === scenario.id,
              );
              return (
                <TableRow key={scenario.id}>
                  <TableCell component="th" scope="row">
                    <Link to={getScenarioEditPath(scenario.id)}>
                      {scenario.name}
                    </Link>
                  </TableCell>
                  <TableCell>{scenarioSessions.length}</TableCell>
                  <TableCell>
                    {
                      scenarioSessions.filter(
                        (session) => session.status === "completed",
                      ).length
                    }
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};
