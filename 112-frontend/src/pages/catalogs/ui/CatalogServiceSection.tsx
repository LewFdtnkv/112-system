import { catalogApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { rowAction } from "@/shared/lib/rowAction";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
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
import { useState } from "react";
import { styles } from "../styles/CatalogsPage";
import type { CatalogServiceSectionProps } from "../types/CatalogSections";

export function CatalogServiceSection({
  onChanged,
}: CatalogServiceSectionProps) {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string>();
  const [code, setCode] = useState("");
  const [shortName, setShortName] = useState("");
  const [name, setName] = useState("");
  const services = useQuery({
    queryKey: ["admin-services", page],
    queryFn: ({ signal }) => catalogApi.services({ offset: page * 20 }, signal),
  });
  const reset = () => {
    setEditingId(undefined);
    setCode("");
    setName("");
    setShortName("");
  };
  const edit = (service: {
    id: string;
    code: string;
    name: string;
    short_name?: string | null;
  }) => {
    setEditingId(service.id);
    setCode(service.code);
    setName(service.name);
    setShortName(service.short_name ?? "");
  };
  const save = useMutation({
    mutationFn: () =>
      editingId
        ? catalogApi.updateService(editingId, {
            name,
            short_name: shortName || null,
          })
        : catalogApi.createService({
            code,
            name,
            short_name: shortName || null,
          }),
    onSuccess: () => {
      reset();
      void client.invalidateQueries({ queryKey: ["admin-services"] });
      onChanged();
    },
  });
  return (
    <>
      <Typography variant="h6" component="h2">
        Службы
      </Typography>
      <Stack
        component="form"
        direction="row"
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <TextField
          label="Код службы"
          disabled={!!editingId}
          required
          value={code}
          slotProps={{ htmlInput: { pattern: "[a-z0-9_\\-]+", maxLength: 50 } }}
          onChange={(event) => setCode(event.target.value)}
        />
        <TextField
          label="Короткое название службы"
          value={shortName}
          slotProps={{ htmlInput: { maxLength: 100 } }}
          onChange={(event) => setShortName(event.target.value)}
        />
        <TextField
          label="Полное наименование службы"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={save.isPending}>
          {editingId ? "Сохранить службу" : "Создать службу"}
        </Button>
        {editingId && <Button onClick={reset}>Отмена</Button>}
      </Stack>
      {save.error && (
        <Alert severity="error">{getApiError(save.error).message}</Alert>
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
                {services.data.items.map((service) => (
                  <TableRow
                    key={service.id}
                    {...rowAction(() => edit(service))}
                  >
                    <TableCell>{service.code}</TableCell>
                    <TableCell>
                      <Button onClick={() => edit(service)}>
                        {service.short_name
                          ? `${service.short_name} — ${service.name}`
                          : service.name}
                      </Button>
                    </TableCell>
                    <TableCell sx={styles.tableCell}>{service.id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PageControls
              total={services.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
    </>
  );
}
