import { jobPurposes, jobStatuses, jobMethods } from "@/entities/ai-job";
import { QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { jobDate } from "../lib/format";
import { useJobDetail } from "../model/useJobDetail";
import type { JobDetailProps } from "../types";
export function JobDetail({ id, onClose }: JobDetailProps) {
  const query = useJobDetail(id);
  const [tab, setTab] = useState("summary");
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
        <Typography component="p" className="ai-jobs__id" data-selectable>
          {id}
        </Typography>
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
                  Воркер не продлил срок удержания задачи. После его истечения
                  задачу может повторно забрать свободный воркер.
                </Alert>
              )}
              {job.generation_method === "template-fallback" && (
                <Alert severity="warning">
                  В сохранённом результате использована заготовка вместо текста
                  ИИ. Причина и попытки проверки доступны в результате.
                </Alert>
              )}
              <Tabs
                value={tab}
                onChange={(_, value: string) => setTab(value)}
                variant="fullWidth"
                aria-label="Данные задачи"
              >
                <Tab
                  wrapped
                  value="summary"
                  label="Сведения"
                  id="job-tab-summary"
                  aria-controls="job-panel"
                />
                <Tab
                  wrapped
                  value="input"
                  label="Входные данные"
                  id="job-tab-input"
                  aria-controls="job-panel"
                />
                <Tab
                  wrapped
                  value="output"
                  label="Результат"
                  id="job-tab-output"
                  aria-controls="job-panel"
                />
                <Tab
                  wrapped
                  value="context"
                  label="Контекст"
                  id="job-tab-context"
                  aria-controls="job-panel"
                />
              </Tabs>
              <div
                role="tabpanel"
                id="job-panel"
                aria-labelledby={`job-tab-${tab}`}
              >
                {tab === "summary" ? (
                  <dl className="ai-jobs__fields">
                    {Object.entries({
                      "Вид задачи": jobPurposes[job.purpose],
                      Состояние: jobStatuses[job.status],
                      Инициатор: job.created_by_username ?? "Система",
                      Ученик: job.student_username,
                      Модель: job.model_version,
                      "Версия промпта": job.prompt_version,
                      "Попытки запуска": job.retry_count,
                      Создана: jobDate(job.created_at),
                      "Доступна для запуска с": jobDate(job.available_at),
                      Завершена: jobDate(job.completed_at),
                      "Удержание воркером до": jobDate(job.lease_expires_at),
                      "Способ генерации": job.generation_method
                        ? (jobMethods[job.generation_method] ??
                          job.generation_method)
                        : null,
                      "ID инициатора": job.created_by_id,
                      "ID ученика": job.student_id,
                      "ID карточки": job.card_template_id,
                      "ID редакции сценария": job.scenario_version_id,
                      "ID попытки ученика": job.attempt_id,
                      "Ключ идемпотентности": job.idempotency_key,
                    }).map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd data-selectable>{value ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                ) : tab === "output" && job.output === null ? (
                  <Typography>Результат ещё не получен.</Typography>
                ) : (
                  <pre className="ai-jobs__json" data-selectable>
                    {JSON.stringify(
                      tab === "input"
                        ? job.input
                        : tab === "output"
                          ? job.output
                          : job.context,
                      null,
                      2,
                    )}
                  </pre>
                )}
              </div>
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
