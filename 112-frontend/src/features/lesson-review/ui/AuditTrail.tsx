import {
  assistanceLabels,
  crewStatusLabels,
  ddsStatusLabels,
  attemptApi,
} from "@/entities/training";
import { QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { kinds, label, reasons, text } from "../model/auditPresentation";
import { styles } from "../styles/AuditTrail";
import type { AuditTrailProps, EventDetailsProps } from "../types/AuditTrail";

function EventDetails({ event }: EventDetailsProps) {
  const changes = event.payload.changes as
    { field: string; before: unknown; after: unknown }[] | undefined;
  if (changes?.length)
    return (
      <details>
        <summary>Изменено полей: {changes.length}</summary>
        {changes.map((change) => (
          <p key={change.field}>
            {label(change.field)}:{" "}
            {change.field === "classifier_entry_id" ? (
              change.after ? (
                change.before ? (
                  "Выбор изменён"
                ) : (
                  "Выбран"
                )
              ) : (
                "Выбор снят"
              )
            ) : (
              <>
                {text(change.before, change.field)} →{" "}
                {text(change.after, change.field)}
              </>
            )}
          </p>
        ))}
      </details>
    );
  if (event.kind === "learning.hint_issued") {
    const response = event.payload.response as
      { hint?: { text?: string } } | undefined;
    return (
      <>
        {assistanceLabels[
          event.payload.level as keyof typeof assistanceLabels
        ] ?? "Подсказка"}{" "}
        ·{" "}
        {event.payload.trigger === "automatic"
          ? "Напоминание после паузы"
          : "По запросу ученика"}
        : {response?.hint?.text ?? "Подсказка"}
      </>
    );
  }
  if (event.kind === "dds.information")
    return <>{String(event.payload.message)}</>;
  if (event.kind === "dds.crew_changed")
    return (
      <>
        {String(event.payload.name)} ·{" "}
        {crewStatusLabels[String(event.payload.status)]} · Наряд:{" "}
        {String(event.payload.crew_number ?? "—")} ·{" "}
        {String(event.payload.comment ?? "")}
      </>
    );
  if (event.kind === "dds.status_changed")
    return (
      <>
        {ddsStatusLabels[String(event.payload.status)]} ·{" "}
        {String(event.payload.comment ?? "")} · Наряд:{" "}
        {String(event.payload.crew_number ?? "—")}
      </>
    );
  if (event.kind === "ui.field_changed")
    return (
      <>
        {label(String(event.payload.field))}:{" "}
        {text(event.payload.value, String(event.payload.field))}
      </>
    );
  if (event.kind === "command.rejected")
    return (
      <>
        {event.payload.operation === "submit" ? "Оповещение" : "Сохранение"}:{" "}
        {reasons[String(event.payload.reason)] ?? "Действие не выполнено"}
      </>
    );
  if (event.kind === "assessment.teacher_reviewed")
    return (
      <>
        {String(event.payload.score)} / {String(event.payload.max_score)} —{" "}
        {String(event.payload.comment ?? "")}
      </>
    );
  return <>—</>;
}
export function AuditTrail({
  lessonId,
  studentId,
  attemptId,
}: AuditTrailProps) {
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["attempt-audit", attemptId],
    initialPageParam: 0,
    enabled: open,
    queryFn: ({ pageParam, signal }) =>
      attemptApi.audit(lessonId, studentId, attemptId, pageParam, signal),
    getNextPageParam: (page) => page.next_sequence ?? undefined,
  });
  const events = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      style={styles.details}
    >
      <summary>Аудит действий ученика</summary>
      {open && (
        <Stack spacing={1} sx={styles.stack}>
          <Alert severity="info">
            История ввода между сохранениями может быть неполной. Она сама по
            себе не служит основанием для снижения оценки.
          </Alert>
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            <TableContainer>
              <Table size="small" aria-label="Аудит действий">
                <TableHead>
                  <TableRow>
                    <TableCell>№</TableCell>
                    <TableCell>Время получения (МСК)</TableCell>
                    <TableCell>Действие</TableCell>
                    <TableCell>Подтверждение</TableCell>
                    <TableCell>Подробности</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.sequence}</TableCell>
                      <TableCell>
                        {new Date(event.occurred_at).toLocaleString("ru-RU", {
                          timeZone: "Europe/Moscow",
                        })}
                      </TableCell>
                      <TableCell>
                        {kinds[event.kind] ?? "Действие ученика"}
                      </TableCell>
                      <TableCell>
                        {event.kind.startsWith("ui.")
                          ? "Ввод без сохранения"
                          : "Сохранено"}
                      </TableCell>
                      <TableCell sx={styles.tableCell}>
                        <EventDetails event={event} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {!events.length && <Typography>Действий пока нет.</Typography>}
            {query.hasNextPage && (
              <Button
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Загрузить следующие действия
              </Button>
            )}
            <Button onClick={() => void query.refetch()}>Обновить аудит</Button>
          </QueryState>
        </Stack>
      )}
    </details>
  );
}
