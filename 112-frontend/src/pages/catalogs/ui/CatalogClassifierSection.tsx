import { getApiError } from "@/shared/api";
import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm } from "@/shared/ui/form-validation";
import { catalogApi } from "@/entities/catalog";
import { rowAction } from "@/shared/lib/rowAction";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { CatalogClassifierSectionProps } from "../types/CatalogSections";

const example = JSON.stringify(
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
);

export function CatalogClassifierSection({
  onSelect,
  onChanged,
}: CatalogClassifierSectionProps) {
  const [page, setPage] = useState(0);
  const [json, setJson] = useState("");
  const [parseError, setParseError] = useState("");
  const classifiers = useQuery({
    queryKey: ["admin-classifiers", page],
    queryFn: ({ signal }) =>
      catalogApi.classifiers({ offset: page * 20 }, signal),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => catalogApi.createClassifier(body),
    onSuccess: () => {
      setJson("");
      onChanged();
    },
  });
  const publish = useMutation({
    mutationFn: (id: string) => catalogApi.publishClassifier(id),
    onSuccess: onChanged,
  });
  return (
    <>
      <Typography variant="h6" component="h2">
        Версии ЕКП
      </Typography>
      <details>
        <summary>Формат JSON</summary>
        <pre>{example}</pre>
      </details>
      <ValidatedForm
        error={create.error}
        spacing={1}
        onSubmit={(event) => {
          event.preventDefault();
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
          name="json"
          label="JSON справочника"
          error={!!parseError}
          helperText={parseError}
          multiline
          minRows={6}
          required
          value={json}
          onChange={(event) => {
            setJson(event.target.value);
            setParseError("");
          }}
        />
        <Button type="submit" disabled={create.isPending}>
          Создать черновик ЕКП
        </Button>
      </ValidatedForm>
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
                {classifiers.data.items.map((classifier) => (
                  <TableRow
                    key={classifier.id}
                    {...rowAction(() => onSelect(classifier.id))}
                  >
                    <TableCell>
                      <Button
                        className="table-block-link"
                        onClick={() => onSelect(classifier.id)}
                      >
                        {classifier.label}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {classifier.status === "published"
                        ? "Опубликована"
                        : "Черновик"}
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={
                          classifier.status !== "draft" || publish.isPending
                        }
                        onClick={() => publish.mutate(classifier.id)}
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
    </>
  );
}
