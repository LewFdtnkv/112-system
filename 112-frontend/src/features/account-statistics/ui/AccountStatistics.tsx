import { userAuditApi } from "@/entities/user";
import { getApiError } from "@/shared/api";
import { download } from "@/shared/lib/download";
import { QueryState } from "@/shared/ui/QueryState";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { metrics, roles } from "../model/metrics";
import "../styles/account-statistics.scss";

export function AccountStatistics() {
  const query = useQuery({
    queryKey: ["account-statistics"],
    queryFn: userAuditApi.statistics,
    refetchInterval: 15000,
  });
  const logs = useMutation({
    mutationFn: async () =>
      download(await userAuditApi.systemLogs(), "system-requests.txt"),
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
          <div className="account-statistics">
            {metrics.map(({ key, label }) => (
              <section
                key={key}
                className={`account-statistics__tile account-statistics__tile--${key}`}
                aria-label={label}
              >
                <h3 className="account-statistics__label">{label}</h3>
                <p className="account-statistics__value">
                  {query.data
                    .reduce((total, row) => total + row[key], 0)
                    .toLocaleString("ru-RU")}
                </p>
                <dl className="account-statistics__roles">
                  {Object.entries(roles).map(([role, name]) => (
                    <div key={role}>
                      <dt>{name}</dt>
                      <dd>
                        {(
                          query.data.find((row) => row.role === role)?.[key] ??
                          0
                        ).toLocaleString("ru-RU")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
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
