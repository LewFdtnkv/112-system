import { useState } from "react";
import {
  Alert,
  Button,
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
import AddIcon from "@mui/icons-material/Add";
import { Link, useLocation } from "react-router-dom";

import {
  scenarioDifficultyLabels,
  scenarioStatusLabels,
  useDemoScenarioStore,
} from "@/entities/scenario";
import { getScenarioEditPath, routePaths } from "@/shared/config/routes";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const ScenariosPage = () => {
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const location = useLocation();
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const filtered = scenarios.filter(
    (scenario) =>
      (status === "all" || scenario.status === status) &&
      `${scenario.name} ${scenario.category}`
        .toLocaleLowerCase("ru-RU")
        .includes(query),
  );

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Сценарии"
        actions={
          <Button
            component={Link}
            to={routePaths.scenarioCreate}
            startIcon={<AddIcon />}
          >
            Новый сценарий
          </Button>
        }
      />
      {location.state?.scenarioSaved === true && (
        <Alert severity="success">
          Сценарий сохранён в демонстрационных данных.
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Поиск сценария"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          type="search"
        />
        <TextField
          select
          label="Статус"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <MenuItem value="all">Все статусы</MenuItem>
          {Object.entries(scenarioStatusLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {filtered.length > 0 ? (
        <TableContainer>
          <Table size="small" aria-label="Сценарии">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Категория</TableCell>
                <TableCell>Сложность</TableCell>
                <TableCell>Минуты</TableCell>
                <TableCell>Статус</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((scenario) => (
                <TableRow key={scenario.id}>
                  <TableCell component="th" scope="row">
                    <Link to={getScenarioEditPath(scenario.id)}>
                      {scenario.name}
                    </Link>
                  </TableCell>
                  <TableCell>{scenario.category}</TableCell>
                  <TableCell>
                    {scenarioDifficultyLabels[scenario.difficulty]}
                  </TableCell>
                  <TableCell>{scenario.durationMinutes}</TableCell>
                  <TableCell>{scenarioStatusLabels[scenario.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <EmptyState
          title="Сценарии не найдены"
          action={
            <Button
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              Сбросить фильтры
            </Button>
          }
        />
      )}
    </Stack>
  );
};
