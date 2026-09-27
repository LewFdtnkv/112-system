import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { Button, Stack, Typography } from "@mui/material";
import { jobDate } from "../lib/format";
import { useAIJobs } from "../model/useAIJobs";
import { JobStats } from "./JobStats";
import { JobFilters } from "./JobFilters";
import { JobTable } from "./JobTable";
import { JobDetail } from "./JobDetail";
import "../styles/ai-jobs.scss";
export function AIJobsPage() {
  const { query, filters, selectedId, update } = useAIJobs();
  return (
    <Stack spacing={2} className="ai-jobs">
      <PageHeader
        title="ИИ-задачи"
        description="Генерация карточек, оценивание и рекомендации по всей системе."
        actions={
          <Button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Обновить
          </Button>
        }
      />
      {query.data && <JobStats summary={query.data.summary} />}
      <Typography variant="caption">
        Счётчики — за всё время, независимо от фильтров.
        {query.data && ` Данные на ${jobDate(query.data.as_of)}.`}
      </Typography>
      <JobFilters filters={filters} update={update} />
      <QueryState
        pending={query.isPending || query.isPlaceholderData}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            {query.data.items.length ? (
              <JobTable
                items={query.data.items}
                onSelect={(id) => update("job", id)}
              />
            ) : (
              <Typography>ИИ-задачи не найдены.</Typography>
            )}
            <PageControls
              total={query.data.total}
              page={query.data.offset / query.data.limit}
              size={query.data.limit}
              onPage={(p) => update("offset", String(p * query.data!.limit))}
            />
          </>
        )}
      </QueryState>
      {selectedId && (
        <JobDetail
          key={selectedId}
          id={selectedId}
          onClose={() => update("job", "")}
        />
      )}
    </Stack>
  );
}
