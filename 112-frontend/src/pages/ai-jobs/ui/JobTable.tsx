import { jobPurposes, jobStatuses, jobMethods } from "@/entities/ai-job";
import { UserIdentity } from "@/entities/user";
import { rowAction } from "@/shared/lib/rowAction";
import {
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { jobDate } from "../lib/format";
import type { JobTableProps } from "../types";
export function JobTable({ items, onSelect }: JobTableProps) {
  return (
    <TableContainer className="ai-jobs__table">
      <Table size="small" aria-label="ИИ-задачи">
        <TableHead>
          <TableRow>
            {[
              "Задача",
              "Состояние",
              "Инициатор / ученик",
              "Создана",
              "Завершена",
              "",
            ].map((label, i) => (
              <TableCell key={i} align={label === "Попытки" ? "right" : "left"}>
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((job) => (
            <TableRow key={job.id} {...rowAction(() => onSelect(job.id))}>
              <TableCell>
                <b>{jobPurposes[job.purpose]}</b>
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={jobStatuses[job.status]}
                  color={
                    job.status === "failed"
                      ? "error"
                      : job.status === "succeeded"
                        ? "success"
                        : job.status === "running"
                          ? "info"
                          : "default"
                  }
                />
                {job.lease_expired && (
                  <Typography
                    variant="caption"
                    component="div"
                    color="warning.main"
                  >
                    Задержка обработки
                  </Typography>
                )}
                {job.generation_method && (
                  <Typography variant="caption" component="div">
                    {jobMethods[job.generation_method] ?? job.generation_method}
                  </Typography>
                )}
                {job.error_summary && (
                  <Typography
                    className="ai-jobs__error"
                    variant="caption"
                    component="div"
                    color="error"
                    title={job.error_summary}
                  >
                    {job.error_summary}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {job.created_by_id ? (
                  <UserIdentity
                    userId={job.created_by_id}
                    name={job.created_by_username ?? "Пользователь"}
                  />
                ) : (
                  "Система"
                )}
                {job.student_username && (
                  <Typography variant="caption" component="div">
                    {job.student_id ? (
                      <UserIdentity
                        userId={job.student_id}
                        name={`Ученик: ${job.student_username}`}
                      />
                    ) : (
                      job.student_username
                    )}
                  </Typography>
                )}
              </TableCell>
              <TableCell className="ai-jobs__date">
                {jobDate(job.created_at)}
              </TableCell>
              <TableCell className="ai-jobs__date">
                {jobDate(job.completed_at)}
              </TableCell>
              <TableCell>
                <Button
                  onClick={() => onSelect(job.id)}
                  aria-label={`Подробнее: ${jobPurposes[job.purpose]}, ${jobDate(job.created_at)}`}
                >
                  Подробнее
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
