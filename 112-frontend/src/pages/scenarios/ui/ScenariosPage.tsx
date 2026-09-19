import { useState } from "react";
import {
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { trainingApi } from "@/entities/training";
import { getScenarioEditPath, routePaths } from "@/shared/config/routes";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
export const ScenariosPage = () => {
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["scenarios", search, status, page],
    queryFn: ({ signal }) =>
      trainingApi.scenarios({ q: search, status, offset: page * 20 }, signal),
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Сценарии" />
      <Button component={Link} to={routePaths.scenarioCreate}>
        Создать сценарий
      </Button>
      <Stack direction="row" spacing={2}>
        <TextField
          label="Поиск сценария"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          select
          label="Публикация"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <MenuItem value="all">Все</MenuItem>
          <MenuItem value="draft">Черновики</MenuItem>
          <MenuItem value="published">Опубликованы</MenuItem>
        </TextField>
      </Stack>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <Table aria-label="Сценарии">
              <TableHead>
                <TableRow>
                  <TableCell>Сценарий</TableCell>
                  <TableCell>Категория</TableCell>
                  <TableCell>Роль</TableCell>
                  <TableCell>Карточек</TableCell>
                  <TableCell>Статус</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        className="table-block-link"
                        to={getScenarioEditPath(s.id)}
                      >
                        {s.title}
                        <small className="block-detail">
                          Версия {s.version}
                        </small>
                      </Link>
                    </TableCell>
                    <TableCell>{s.category || "—"}</TableCell>
                    <TableCell>
                      {s.role === "operator_112" ? "Оператор 112" : "ДДС"}
                    </TableCell>
                    <TableCell>{s.card_count}</TableCell>
                    <TableCell>
                      {s.status === "published" ? "Опубликован" : "Черновик"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PageControls
              total={query.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
    </Stack>
  );
};
