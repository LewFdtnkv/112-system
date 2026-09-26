import {
  activityApi,
  scenarioApi,
  scenarioDifficultyLabel,
  type ScenarioItem,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { getScenarioEditPath, routePaths } from "@/shared/config/routes";
import { rowAction } from "@/shared/lib/rowAction";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableContainer,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/scenarios.scss";
export const ScenariosPage = () => {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [remove, setRemove] = useState<ScenarioItem | null>(null);
  const deletion = useMutation({
    mutationFn: () => activityApi.deleteScenario(remove!.id),
    onSuccess: () => {
      setRemove(null);
      void client.invalidateQueries({ queryKey: ["scenarios"] });
      void client.invalidateQueries({ queryKey: ["scenario-options"] });
    },
  });
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["scenarios", search, status, page],
    queryFn: ({ signal }) =>
      scenarioApi.list({ q: search, status, offset: page * 20 }, signal),
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Сценарии" />
      {deletion.isSuccess && (
        <Alert severity="success">
          {deletion.data.result === "archived"
            ? "Сценарий архивирован. История заданий сохранена."
            : "Неиспользованный сценарий удалён."}
        </Alert>
      )}
      <Dialog open={!!remove} onClose={() => setRemove(null)} fullWidth>
        <DialogTitle>Удалить сценарий «{remove?.title}»?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Alert severity="info">
              Неиспользованный сценарий будет удалён. Если по нему уже назначено
              задание, сценарий перейдёт в архив, а результаты сохранятся.
            </Alert>
            {deletion.error && (
              <Alert severity="error">
                {getApiError(deletion.error).message}
              </Alert>
            )}
            <Button
              disabled={deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              Подтвердить удаление
            </Button>
            <Button onClick={() => setRemove(null)}>Отмена</Button>
          </Stack>
        </DialogContent>
      </Dialog>
      <Button component={Link} to={routePaths.scenarioCreate}>
        Создать сценарий
      </Button>
      <div className="scenario-filters">
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
      </div>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <TableContainer>
              <Table aria-label="Сценарии" className="scenario-table">
                <TableHead>
                  <TableRow>
                    <TableCell>Сценарий</TableCell>
                    <TableCell>Категория</TableCell>
                    <TableCell>Роль</TableCell>
                    <TableCell>Сложность</TableCell>
                    <TableCell>Карточек</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {query.data.items.map((s) => (
                    <TableRow
                      key={s.id}
                      {...rowAction(() => navigate(getScenarioEditPath(s.id)))}
                    >
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
                      <TableCell>
                        {scenarioDifficultyLabel(s.difficulty)}
                      </TableCell>
                      <TableCell>{s.card_count}</TableCell>
                      <TableCell>
                        {s.status === "published" ? "Опубликован" : "Черновик"}
                      </TableCell>
                      <TableCell>
                        <Button
                          component={Link}
                          to={`/training?scenario=${s.id}&title=${encodeURIComponent(s.title)}`}
                          disabled={s.status !== "published"}
                        >
                          Назначить задание
                        </Button>
                        <Button
                          color="error"
                          onClick={() => {
                            setRemove(s);
                            deletion.reset();
                          }}
                        >
                          Удалить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
