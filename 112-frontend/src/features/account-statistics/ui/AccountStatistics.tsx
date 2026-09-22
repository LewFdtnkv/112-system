import { activityApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { download } from "@/shared/lib/download";
import { QueryState } from "@/shared/ui/QueryState";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
const roles: Record<string, string> = {
  admin: "Администраторы",
  teacher: "Преподаватели",
  student: "Ученики",
};
export function AccountStatistics() {
  const query = useQuery({
    queryKey: ["account-statistics"],
    queryFn: activityApi.statistics,
    refetchInterval: 15000,
  });
  const logs = useMutation({
    mutationFn: async () =>
      download(await activityApi.systemLogs(), "system-requests.txt"),
  });
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Учётные записи и сеансы</Typography>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={query.data.map((r) => ({ ...r, name: roles[r.role] }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="registered"
                  name="Учётные записи"
                  fill="#1976a1"
                />
                <Bar
                  dataKey="sessions"
                  name="Действующие сеансы"
                  fill="#63a68c"
                />
              </BarChart>
            </ResponsiveContainer>
            <Typography>
              Всего: {query.data.reduce((n, r) => n + r.registered, 0)} ·{" "}
              {query.data
                .map((r) => `${roles[r.role]}: ${r.registered}`)
                .join(" · ")}
            </Typography>
          </>
        )}
      </QueryState>
      <Typography variant="caption">
        Действующие сеансы — неотозванные входы до истечения срока, а не число
        пользователей онлайн.
      </Typography>
      <Button disabled={logs.isPending} onClick={() => logs.mutate()}>
        Скачать системный журнал
      </Button>
      {logs.error && (
        <Alert severity="error">{getApiError(logs.error).message}</Alert>
      )}
    </Stack>
  );
}
