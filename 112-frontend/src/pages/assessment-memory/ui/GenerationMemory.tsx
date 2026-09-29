import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { routePaths } from "@/shared/config/routes";
import { Link } from "react-router-dom";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { useGenerationMemory } from "../model/useGenerationMemory";
import { GenerationCardDialog } from "./GenerationCardDialog";
import type { GenerationMemoryFilter } from "../types/generationMemory";
import "../styles/assessment-memory.scss";

export function GenerationMemory() {
  const m = useGenerationMemory();
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Здесь ваши карточки, разрешённые как примеры для генерации. ИИ выбирает
        подходящие по типу происшествия, фактам и режиму 112/ДДС; не каждая
        отмеченная карточка используется в каждом запросе. Система также
        использует встроенные учебные примеры.
      </Alert>
      <div>
        <Button component={Link} to={routePaths.cards}>
          Открыть библиотеку карточек
        </Button>
      </div>
      <div className="memory-library-filters">
        <TextField
          label="Поиск карточки"
          value={m.filter.q}
          onChange={(event) => m.change({ q: event.target.value })}
        />
        <TextField
          select
          label="Использование для генерации"
          value={m.filter.state}
          onChange={(event) =>
            m.change({
              state: event.target.value as GenerationMemoryFilter["state"],
            })
          }
        >
          <MenuItem value="enabled">Используются как примеры</MenuItem>
          <MenuItem value="disabled">Не используются</MenuItem>
          <MenuItem value="all">Все мои карточки</MenuItem>
        </TextField>
      </div>
      <QueryState
        pending={m.query.isPending}
        error={m.query.error}
        retry={() => void m.query.refetch()}
      >
        <TableContainer component={Paper}>
          <Table
            size="small"
            className="memory-library-table"
            aria-label="Карточки для генерации"
          >
            <TableHead>
              <TableRow>
                <TableCell>Карточка</TableCell>
                <TableCell>Происшествие</TableCell>
                <TableCell>Использование</TableCell>
                <TableCell>Изменена</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {m.query.data?.items.map((card) => (
                <TableRow
                  key={card.id}
                  hover
                  tabIndex={0}
                  className="memory-library-row"
                  onClick={() => m.select(card.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      m.select(card.id);
                    }
                  }}
                >
                  <TableCell>{card.title}</TableCell>
                  <TableCell>{card.incident_name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={
                        card.generation_example ? "Включена" : "Не используется"
                      }
                      color={card.generation_example ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(card.updated_at).toLocaleDateString("ru-RU")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {m.query.data?.total === 0 && (
          <Alert severity="info">
            Карточек с такими условиями нет. Выберите «Все мои карточки»,
            откройте подходящую карточку и включите «Использовать как пример
            генерации» после проверки её содержания.
          </Alert>
        )}
        {!!m.query.data?.total && (
          <PageControls
            total={m.query.data.total}
            page={m.filter.page}
            onPage={(page) => m.change({ page })}
          />
        )}
      </QueryState>
      {m.selectedId && (
        <GenerationCardDialog
          id={m.selectedId}
          onClose={() => m.select(undefined)}
        />
      )}
    </Stack>
  );
}
