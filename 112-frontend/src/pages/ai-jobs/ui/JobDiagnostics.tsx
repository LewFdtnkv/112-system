import { Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { jobDate } from "../lib/format";
import type { JobDiagnosticsProps } from "../types";
import { JobJson } from "./JobJson";

export function JobDiagnostics({ job }: JobDiagnosticsProps) {
  const [tab, setTab] = useState("technical");
  return (
    <details className="ai-jobs__diagnostics">
      <summary>Технические сведения</summary>
      <Tabs
        value={tab}
        onChange={(_, value: string) => setTab(value)}
        variant="fullWidth"
        aria-label="Диагностика задачи"
      >
        {Object.entries({
          technical: "Параметры",
          input: "Входные данные",
          output: "Результат",
          context: "Контекст",
        }).map(([key, label]) => (
          <Tab
            key={key}
            wrapped
            value={key}
            label={label}
            id={`job-tab-${key}`}
            aria-controls="job-panel"
          />
        ))}
      </Tabs>
      <div role="tabpanel" id="job-panel" aria-labelledby={`job-tab-${tab}`}>
        {tab === "technical" ? (
          <dl className="ai-jobs__fields">
            {Object.entries({
              "ID задачи": job.id,
              Модель: job.model_version,
              "Версия промпта": job.prompt_version,
              "Попытки запуска": job.retry_count,
              "Доступна для запуска с": jobDate(job.available_at),
              "Удержание воркером до": jobDate(job.lease_expires_at),
              "ID инициатора": job.created_by_id,
              "ID ученика": job.student_id,
              "ID карточки": job.card_template_id ?? job.target_card_id,
              "ID генерации исходной карточки": job.parent_job_id,
              "ID редакции сценария": job.scenario_version_id,
              "ID попытки ученика": job.attempt_id,
              "Ключ идемпотентности": job.idempotency_key,
            })
              .filter(([, value]) => value != null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd data-selectable>{value}</dd>
                </div>
              ))}
          </dl>
        ) : tab === "output" && job.output === null ? (
          <Typography>Результат ещё не получен.</Typography>
        ) : (
          <JobJson
            key={tab}
            value={
              tab === "input"
                ? job.input
                : tab === "output"
                  ? job.output
                  : job.context
            }
          />
        )}
      </div>
    </details>
  );
}
