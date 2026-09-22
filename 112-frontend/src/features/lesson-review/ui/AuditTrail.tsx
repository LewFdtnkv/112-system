import { ddsStatusLabels, fieldLabels, trainingApi } from "@/entities/training";
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
import { styles } from "../styles/AuditTrail";
import type { AuditTrailProps, EventDetailsProps } from "../types/AuditTrail";

const kinds: Record<string, string> = {
  "dds.card_received": "Получение карточки ДДС",
  "dds.information": "Сообщение по сценарию",
  "dds.status_changed": "Изменение статуса ДДС",
  "dds.submitted": "Сдача упражнения ДДС",
  "attempt.started": "Начало карточки",
  "card.draft_saved": "Сохранение черновика",
  "card.notified": "Оповещение служб",
  "command.rejected": "Действие отклонено",
  "assessment.rules_completed": "Автоматическая оценка",
  "assessment.teacher_reviewed": "Пересмотр преподавателем",
  "ui.card_opened": "Открытие формы",
  "ui.card_closed": "Закрытие формы",
  "ui.field_changed": "Изменение поля",
};
const label = (path: string) =>
  path
    .split(".")
    .filter((part) => part !== "data")
    .map((part) => fieldLabels[part] ?? part)
    .join(" / ");
const reasons: Record<string, string> = {
  "Card revision is stale; reload the card":
    "Карточка изменена в другой вкладке. Требуется обновить данные",
  "Address and incident description are required":
    "Заполните адрес и сообщение о происшествии",
  "This attempt is no longer editable": "Работа уже завершена",
  "This attempt cannot be submitted": "Эту работу нельзя отправить повторно",
  "Choose an incident code from the assigned classifier":
    "Выберите тип происшествия",
  "Choose a code from the assigned classifier":
    "Выберите тип из справочника задания",
  "Active prepared service routes are required":
    "Для выбранного типа не настроены службы",
  "Conditional routing is not supported by this workflow yet":
    "Условные правила оповещения пока не поддерживаются",
};
const text = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "Пусто"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
function EventDetails({ event }: EventDetailsProps) {
  const changes = event.payload.changes as
    { field: string; before: unknown; after: unknown }[] | undefined;
  if (changes?.length)
    return (
      <details>
        <summary>Изменено полей: {changes.length}</summary>
        {changes.map((change) => (
          <p key={change.field}>
            {label(change.field)}: {text(change.before)} → {text(change.after)}
          </p>
        ))}
      </details>
    );
  if (event.kind === "dds.information")
    return <>{String(event.payload.message)}</>;
  if (event.kind === "dds.status_changed")
    return (
      <>
        {ddsStatusLabels[String(event.payload.status)]} ·{" "}
        {String(event.payload.comment)} · Наряд:{" "}
        {String(event.payload.crew_number ?? "—")}
      </>
    );
  if (event.kind === "ui.field_changed")
    return (
      <>
        {label(String(event.payload.field))}: {text(event.payload.value)}
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
        {String(event.payload.comment)}
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
      trainingApi.audit(lessonId, studentId, attemptId, pageParam, signal),
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
            Сохранения и оповещение подтверждены сервером. Наблюдения браузера
            отражают ввод между сохранениями, могут быть неполными и не
            используются сами по себе для снижения оценки.
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
                    <TableCell>Источник</TableCell>
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
                      <TableCell>{kinds[event.kind] ?? event.kind}</TableCell>
                      <TableCell>
                        {event.kind.startsWith("ui.")
                          ? "Браузер · не подтверждено"
                          : "Сервер"}
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
