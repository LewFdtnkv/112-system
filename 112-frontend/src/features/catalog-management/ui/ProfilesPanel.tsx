import {
  trainingApi,
  type ProfileInput,
  type ServiceProfile,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { rowAction } from "@/shared/lib/rowAction";
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
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ProfileForm } from "./ProfileForm";
const empty: ProfileInput = {
  service_id: "",
  name: "",
  responsibility: "",
  procedure: "",
  territories: [],
  objects: [],
  contacts: [],
};
const input = (p: ServiceProfile): ProfileInput => ({
  service_id: p.service_id,
  name: p.name,
  responsibility: p.responsibility,
  procedure: p.procedure,
  territories: p.territories,
  objects: p.objects,
  contacts: p.contacts,
});
export function ProfilesPanel() {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [fresh, setFresh] = useState(false);
  const query = useQuery({
    queryKey: ["admin-profiles", page],
    queryFn: ({ signal }) =>
      trainingApi.adminProfiles({ offset: page * 20 }, signal),
  });
  const detail = useQuery({
    queryKey: ["admin-profile", selected],
    enabled: !!selected,
    queryFn: ({ signal }) => trainingApi.adminProfile(selected!, signal),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-profiles"] });
    void client.invalidateQueries({ queryKey: ["admin-profile"] });
    void client.invalidateQueries({ queryKey: ["profiles"] });
  };
  const publish = useMutation({
    mutationFn: (id: string) => trainingApi.publishProfile(id),
    onSuccess: refresh,
  });
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h6">
        Профили служб ДДС
      </Typography>
      <Alert severity="info">
        Администратор готовит и публикует профиль. Преподаватель выбирает его
        при создании сценария ДДС. Новая версия не изменяет назначенные уроки.
      </Alert>
      <Button onClick={() => setFresh(true)}>Создать профиль службы</Button>
      {publish.error && (
        <Alert severity="error">{getApiError(publish.error).message}</Alert>
      )}
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <Table aria-label="Профили служб">
              <TableHead>
                <TableRow>
                  <TableCell>Профиль</TableCell>
                  <TableCell>Версия</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((p) => (
                  <TableRow key={p.id} {...rowAction(() => setSelected(p.id))}>
                    <TableCell>
                      <Button
                        className="table-block-link"
                        onClick={() => setSelected(p.id)}
                      >
                        {p.name}
                      </Button>
                    </TableCell>
                    <TableCell>{p.version}</TableCell>
                    <TableCell>
                      {p.status === "published" ? "Опубликован" : "Черновик"}
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={p.status !== "draft" || publish.isPending}
                        onClick={() => publish.mutate(p.id)}
                      >
                        Опубликовать профиль
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
      <Dialog
        open={fresh || !!selected}
        onClose={() => {
          setFresh(false);
          setSelected(undefined);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {fresh ? "Новый профиль службы" : "Профиль службы"}
        </DialogTitle>
        <DialogContent>
          {fresh ? (
            <ProfileForm
              initial={empty}
              onSaved={() => {
                setFresh(false);
                refresh();
              }}
            />
          ) : (
            <QueryState
              pending={detail.isPending}
              error={detail.error}
              retry={() => void detail.refetch()}
            >
              {detail.data && (
                <ProfileForm
                  key={`${detail.data.id}-${detail.data.revision}`}
                  initial={input(detail.data)}
                  existing={detail.data}
                  onSaved={() => {
                    setSelected(undefined);
                    refresh();
                  }}
                />
              )}
            </QueryState>
          )}
          <Button
            onClick={() => {
              setFresh(false);
              setSelected(undefined);
            }}
          >
            Закрыть профиль
          </Button>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
