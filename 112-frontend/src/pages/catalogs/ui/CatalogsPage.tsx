import { useState } from "react";
import {
  Alert,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
export const CatalogsPage = () => {
  const client = useQueryClient();
  const [servicePage, setServicePage] = useState(0);
  const [page, setPage] = useState(0);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [parseError, setParseError] = useState("");
  const services = useQuery({
    queryKey: ["admin-services", servicePage],
    queryFn: ({ signal }) =>
      trainingApi.adminServices({ offset: servicePage * 20 }, signal),
  });
  const classifiers = useQuery({
    queryKey: ["admin-classifiers", page],
    queryFn: ({ signal }) =>
      trainingApi.adminClassifiers({ offset: page * 20 }, signal),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-summary"] });
    void client.invalidateQueries({ queryKey: ["admin-classifiers"] });
    void client.invalidateQueries({ queryKey: ["classifier-options"] });
  };
  const createService = useMutation({
    mutationFn: () => trainingApi.createService({ code, name }),
    onSuccess: () => {
      setCode("");
      setName("");
      void client.invalidateQueries({ queryKey: ["admin-services"] });
      refresh();
    },
  });
  const create = useMutation({
    mutationFn: (body: unknown) => trainingApi.createClassifier(body),
    onSuccess: () => {
      setJson("");
      refresh();
    },
  });
  const publish = useMutation({
    mutationFn: (id: string) => trainingApi.publishClassifier(id),
    onSuccess: refresh,
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Службы и классификаторы" />
      <Typography variant="h6" component="h2">
        Службы
      </Typography>
      <Stack
        component="form"
        direction="row"
        spacing={2}
        onSubmit={(e) => {
          e.preventDefault();
          createService.mutate();
        }}
      >
        <TextField
          label="Код службы"
          required
          value={code}
          slotProps={{ htmlInput: { pattern: "[a-z0-9_-]+", maxLength: 50 } }}
          onChange={(e) => setCode(e.target.value)}
        />
        <TextField
          label="Название службы"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={createService.isPending}>
          Создать службу
        </Button>
      </Stack>
      {createService.error && (
        <Alert severity="error">
          {getApiError(createService.error).message}
        </Alert>
      )}
      <QueryState
        pending={services.isPending}
        error={services.error}
        retry={() => void services.refetch()}
      >
        {services.data && (
          <>
            <Table aria-label="Службы">
              <TableHead>
                <TableRow>
                  <TableCell>Код</TableCell>
                  <TableCell>Название</TableCell>
                  <TableCell>ID для справочника</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.data.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell sx={{ userSelect: "text" }}>{s.id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PageControls
              total={services.data.total}
              page={servicePage}
              onPage={setServicePage}
            />
          </>
        )}
      </QueryState>
      <Typography variant="h6" component="h2">
        Версии ЕКП
      </Typography>
      <Alert severity="info">
        Загрузите подготовленный JSON с безусловными маршрутами, проверьте его и
        опубликуйте версию. Импорт исходных XLSX и условных правил пока не
        подключён.
      </Alert>
      <details>
        <summary>Формат JSON</summary>
        <pre>
          {JSON.stringify(
            {
              label: "Учебная версия",
              source_filename: "training.json",
              entries: [
                {
                  code: "T001",
                  section: "Учебные происшествия",
                  name: "Название типа",
                  service_ids: ["ID службы из таблицы"],
                },
              ],
            },
            null,
            2,
          )}
        </pre>
      </details>
      <Stack
        component="form"
        spacing={1}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const body: unknown = JSON.parse(json);
            setParseError("");
            create.mutate(body);
          } catch {
            setParseError("Проверьте синтаксис JSON.");
          }
        }}
      >
        <TextField
          label="JSON справочника"
          multiline
          minRows={6}
          required
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Создать черновик ЕКП
        </Button>
      </Stack>
      {parseError && <Alert severity="error">{parseError}</Alert>}
      {create.error && (
        <Alert severity="error">{getApiError(create.error).message}</Alert>
      )}
      {publish.error && (
        <Alert severity="error">{getApiError(publish.error).message}</Alert>
      )}
      <QueryState
        pending={classifiers.isPending}
        error={classifiers.error}
        retry={() => void classifiers.refetch()}
      >
        {classifiers.data && (
          <>
            <Table aria-label="Классификаторы">
              <TableHead>
                <TableRow>
                  <TableCell>Версия</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Публикация</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {classifiers.data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.label}</TableCell>
                    <TableCell>
                      {c.status === "published" ? "Опубликована" : "Черновик"}
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={c.status !== "draft" || publish.isPending}
                        onClick={() => publish.mutate(c.id)}
                      >
                        Опубликовать
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PageControls
              total={classifiers.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
    </Stack>
  );
};
