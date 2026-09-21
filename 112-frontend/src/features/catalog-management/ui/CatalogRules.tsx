import { trainingApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { rowAction } from "@/shared/lib/rowAction";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/CatalogRules";
import type { CatalogRulesProps } from "../types/CatalogRules";
import { RuleForm } from "./RuleForm";

export function CatalogRules({
  versionId,
  onClose,
  onChanged,
}: CatalogRulesProps) {
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [page, setPage] = useState(0);
  const [entryId, setEntryId] = useState<string>();
  const [label, setLabel] = useState("");
  const query = useQuery({
    queryKey: ["catalog-rules", versionId, search, page],
    queryFn: ({ signal }) =>
      trainingApi.catalogRules(
        versionId,
        { q: search, offset: page * 20 },
        signal,
      ),
  });
  const detail = useQuery({
    queryKey: ["catalog-rule", versionId, entryId],
    enabled: !!entryId,
    queryFn: ({ signal }) =>
      trainingApi.catalogRule(versionId, entryId!, signal),
  });
  const clone = useMutation({
    mutationFn: () => trainingApi.cloneCatalog(versionId, label),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });
  const download = useMutation({
    mutationFn: async () => {
      const blob = await trainingApi.exportCatalog(versionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ekp-${versionId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>ЕКП: {query.data?.version.label}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={styles.stack}>
          <Button
            onClick={() => download.mutate()}
            disabled={download.isPending}
          >
            Скачать JSON
          </Button>
          {query.data?.version.status !== "draft" && (
            <Alert severity="info">
              Эта версия опубликована. Для изменения правил создайте новый
              черновик.
            </Alert>
          )}
          <Stack
            component="form"
            direction="row"
            spacing={1}
            onSubmit={(e) => {
              e.preventDefault();
              clone.mutate();
            }}
          >
            <TextField
              fullWidth
              required
              label="Название новой версии ЕКП"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button type="submit" disabled={clone.isPending}>
              Создать новую версию
            </Button>
          </Stack>
          {(clone.error || download.error) && (
            <Alert severity="error">
              {getApiError(clone.error || download.error).message}
            </Alert>
          )}
          <TextField
            label="Поиск правила ЕКП"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            {query.data && (
              <>
                <Table aria-label="Правила ЕКП">
                  <TableHead>
                    <TableRow>
                      <TableCell>Код</TableCell>
                      <TableCell>Раздел</TableCell>
                      <TableCell>Происшествие</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {query.data.items.map((e) => (
                      <TableRow
                        key={e.id}
                        {...rowAction(() => setEntryId(e.id))}
                      >
                        <TableCell>{e.code}</TableCell>
                        <TableCell>{e.section}</TableCell>
                        <TableCell>
                          <Button
                            className="table-block-link"
                            onClick={() => setEntryId(e.id)}
                          >
                            {e.name}
                          </Button>
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
          <Button onClick={onClose}>Закрыть справочник</Button>
        </Stack>
      </DialogContent>
      {entryId && (
        <Dialog
          open
          fullWidth
          maxWidth="md"
          onClose={() => setEntryId(undefined)}
        >
          <DialogTitle>Правило ЕКП</DialogTitle>
          <DialogContent>
            <QueryState
              pending={detail.isPending}
              error={detail.error}
              retry={() => void detail.refetch()}
            >
              {detail.data && (
                <RuleForm
                  key={`${entryId}-${detail.data.revision}`}
                  initial={detail.data.entry}
                  editable={query.data?.version.status === "draft"}
                  save={(entry) =>
                    trainingApi.updateCatalogRule(
                      versionId,
                      entryId,
                      detail.data!.revision,
                      entry,
                    )
                  }
                  onSaved={() => {
                    setEntryId(undefined);
                    void query.refetch();
                    onChanged();
                  }}
                />
              )}
            </QueryState>
            <Button onClick={() => setEntryId(undefined)}>
              Закрыть правило
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
