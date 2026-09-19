import { Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { trainingApi } from "@/entities/training";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
export const AdminDashboardPage = () => {
  const query = useQuery({
    queryKey: ["admin-summary"],
    queryFn: ({ signal }) => trainingApi.adminSummary(signal),
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Кабинет администратора" />
      <div className="action-links">
        <Link to={routePaths.users}>Пользователи</Link>
        <Link to={routePaths.catalogs}>Службы и ЕКП</Link>
      </div>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <Typography>
            Учётных записей: {query.data.users} · Служб: {query.data.services} ·
            Версий ЕКП: {query.data.classifiers}
          </Typography>
        )}
      </QueryState>
    </Stack>
  );
};
