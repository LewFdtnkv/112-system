import { jobPurposes, jobStatuses, jobMethods } from "@/entities/ai-job";
import { UserIdentity } from "@/entities/user";
import { QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { JobDiagnostics } from "./JobDiagnostics";
import { jobDate } from "../lib/format";
import { useJobDetail } from "../model/useJobDetail";
import type { JobDetailProps } from "../types";
export function JobDetail({ id, onClose }: JobDetailProps) {
  const query = useJobDetail(id);
  const job = query.data;
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-labelledby="ai-job-title"
    >
      <DialogTitle id="ai-job-title">Данные ИИ-задачи</DialogTitle>
      <DialogContent className="ai-jobs__detail">
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          {job && (
            <>
              {job.error && <Alert severity="error">{job.error}</Alert>}
              {job.lease_expired && (
                <Alert severity="warning">
                  Обработка задерживается. Ожидается повторный запуск.
                </Alert>
              )}
              {job.generation_method === "template-fallback" && (
                <Alert severity="warning">
                  В сохранённом результате использована заготовка вместо текста
                  ИИ. Причина и попытки проверки доступны в результате.
                </Alert>
              )}
              <dl className="ai-jobs__fields">
                {Object.entries({
                  "Вид задачи": jobPurposes[job.purpose],
                  Состояние: jobStatuses[job.status],
                  Инициатор: job.created_by_id ? (
                    <UserIdentity
                      userId={job.created_by_id}
                      name={job.created_by_username ?? "Пользователь"}
                    />
                  ) : (
                    "Система"
                  ),
                  Ученик: job.student_id ? (
                    <UserIdentity
                      userId={job.student_id}
                      name={job.student_username ?? "Ученик"}
                    />
                  ) : null,
                  Создана: jobDate(job.created_at),
                  Завершена: jobDate(job.completed_at),
                  "Способ генерации": job.generation_method
                    ? (jobMethods[job.generation_method] ??
                      job.generation_method)
                    : null,
                })
                  .filter(([, value]) => value != null)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd data-selectable>{value ?? "—"}</dd>
                    </div>
                  ))}
              </dl>
              <JobDiagnostics job={job} />
            </>
          )}
        </QueryState>
      </DialogContent>
      <DialogActions>
        <Button
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Обновить данные
        </Button>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
