import { useState } from "react";
import { Button, MenuItem, Stack, TextField } from "@mui/material";

import { useDemoScenarioStore } from "@/entities/scenario";
import {
  trainingStatusLabels,
  useDemoTrainingStore,
} from "@/entities/training-session";
import { demoUsers } from "@/entities/user";
import { PageHeader } from "@/shared/ui/PageHeader";
import { SessionTable } from "@/widgets/session-monitor";

export const SessionMonitoringPage = () => {
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const allSessions = useDemoTrainingStore((state) => state.sessions);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const sessions = allSessions.filter((session) => {
    const scenario = scenarios.find((item) => item.id === session.scenarioId);
    const student = demoUsers.find((user) => user.id === session.studentId);
    return (
      (status === "all" || session.status === status) &&
      `${scenario?.name ?? ""} ${student?.name ?? ""}`
        .toLocaleLowerCase("ru-RU")
        .includes(query)
    );
  });

  return (
    <Stack spacing={2}>
      <PageHeader title="Мониторинг занятий" />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Сценарий или ученик"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <TextField
          label="Статус занятия"
          select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <MenuItem value="all">Все статусы</MenuItem>
          {Object.entries(trainingStatusLabels).map(([value, label]) => (
            <MenuItem value={value} key={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          onClick={() => {
            setSearch("");
            setStatus("all");
          }}
          disabled={!search && status === "all"}
        >
          Сбросить фильтры
        </Button>
      </Stack>
      <SessionTable sessions={sessions} label="Мониторинг занятий" />
    </Stack>
  );
};
