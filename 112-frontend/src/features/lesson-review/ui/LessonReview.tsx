import { randomUUID } from "@/shared/lib/uuid";
import { useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  trainingApi,
  CardDataFields,
  type Grade,
  type WorkReview,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { getStudentTrainingWorkspacePath } from "@/shared/config/routes";
import { QueryState } from "@/shared/ui/QueryState";
import { AutomaticCheckView } from "./AutomaticCheckView";
import { AuditTrail } from "./AuditTrail";
export function StudentResult({ lessonId }: { lessonId: string }) {
  const grade = useQuery({
    queryKey: ["evaluation", lessonId],
    queryFn: ({ signal }) => trainingApi.evaluation(lessonId, signal),
    refetchInterval: 15000,
  });
  const lesson = useQuery({
    queryKey: ["student-lesson", lessonId],
    queryFn: ({ signal }) => trainingApi.studentLesson(lessonId, signal),
  });
  return (
    <QueryState
      pending={grade.isPending || lesson.isPending}
      error={grade.error || lesson.error}
      retry={() => {
        void grade.refetch();
        void lesson.refetch();
      }}
    >
      {grade.data ? (
        <GradeView grade={grade.data} />
      ) : (
        <Alert severity="info">
          {lesson.data?.work_status === "submitted"
            ? "Автоматическая оценка недоступна для этой работы. Обратитесь к преподавателю"
            : "Работа ещё не сдана"}
          . Оценка ИИ пока не подключена.
        </Alert>
      )}
      <Button component={Link} to={getStudentTrainingWorkspacePath(lessonId)}>
        Карточки занятия
      </Button>
    </QueryState>
  );
}
function GradeView({ grade }: { grade: Grade }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" component="h2">
        {grade.method === "rules"
          ? "Автоматическая оценка"
          : "Оценка преподавателя"}
        : {grade.score} / {grade.max_score}
      </Typography>
      <p style={{ whiteSpace: "pre-wrap" }}>{grade.comment}</p>
      {grade.assessment_details && (
        <Stack spacing={1}>
          {!!grade.assessment_details.missed_cards && (
            <Alert severity="warning">
              Не начато карточек: {grade.assessment_details.missed_cards}. Они
              учтены как 0. Итог — сумма процентов оценённых карточек, делённая
              на число всех назначенных карточек.
            </Alert>
          )}
          {grade.assessment_details.criteria.map((criterion) => (
            <Typography key={criterion.code} variant="body2">
              {criterion.label}: {criterion.score} / {criterion.max_score}
            </Typography>
          ))}
          <Alert severity="info">
            Оценены формальные критерии{" "}
            {grade.assessment_details.evaluated_cards} карточек. Смысловых полей
            вне оценки: {grade.assessment_details.unverified_fields}. ИИ пока не
            подключён; итог можно пересмотреть у преподавателя.
          </Alert>
        </Stack>
      )}
      <small>
        Редакция {grade.revision} ·{" "}
        {new Date(grade.created_at).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        })}
      </small>
    </Paper>
  );
}
export function LessonReview({
  lessonId,
  studentId,
  renderProctoring,
}: {
  lessonId: string;
  studentId: string;
  renderProctoring?: (attemptId: string) => ReactNode;
}) {
  const query = useQuery({
    queryKey: ["work-review", lessonId, studentId],
    queryFn: ({ signal }) => trainingApi.review(lessonId, studentId, signal),
    refetchInterval: 5000,
  });
  return (
    <QueryState
      pending={query.isPending}
      error={query.error}
      retry={() => void query.refetch()}
    >
      {query.data && (
        <Review
          renderProctoring={renderProctoring}
          data={query.data}
          reload={() => void query.refetch()}
        />
      )}
    </QueryState>
  );
}
function Review({
  data,
  reload,
  renderProctoring,
}: {
  data: WorkReview;
  reload: () => void;
  renderProctoring?: (attemptId: string) => ReactNode;
}) {
  const calculate = useMutation({
    mutationFn: () =>
      trainingApi.automaticGrade(data.lesson_id, data.student_id),
    onSuccess: reload,
  });
  const latest = data.evaluations.at(-1);
  return (
    <Stack spacing={2}>
      {latest && <GradeView grade={latest} />}
      {!latest && data.submitted && (
        <Stack spacing={1}>
          <Alert severity="info">
            Работа завершена до включения автоматического оценивания.
          </Alert>
          <Button
            disabled={calculate.isPending}
            onClick={() => calculate.mutate()}
          >
            Рассчитать автоматическую оценку
          </Button>
          {calculate.error && (
            <Alert severity="error">
              {getApiError(calculate.error).message}
            </Alert>
          )}
        </Stack>
      )}
      {!data.submitted && (
        <Alert severity="info">
          Работа ещё не сдана полностью. Итог будет рассчитан автоматически
          после последней карточки.
        </Alert>
      )}
      {data.assignments.map((row) => (
        <Paper key={row.assignment_id} sx={{ p: 2 }}>
          <Typography variant="h6" component="h2">
            {row.position}. {row.source_snapshot?.title ?? "Карточка"}
          </Typography>
          <p>
            <b>Условие:</b> {row.source_snapshot?.caller_message}
          </p>
          <div className="review-columns">
            <section>
              <h3>Сведения преподавателя</h3>
              <p>
                Тип: {row.source_classifier_entry?.code}{" "}
                {row.source_classifier_entry?.name || "—"}
              </p>
              <p>
                Получатели:{" "}
                {row.source_snapshot?.recipients
                  ?.map((s) => s.name)
                  .join(", ") || "—"}
              </p>
              <p>Адрес: {row.source_snapshot?.data.address_text}</p>
              <p>Сообщение: {row.source_snapshot?.data.description}</p>
            </section>
            <section>
              <h3>Карточка ученика</h3>
              {row.attempt ? (
                <>
                  <p>Адрес: {row.attempt.card.data.address_text || "—"}</p>
                  <p>Сообщение: {row.attempt.card.data.description || "—"}</p>
                  <p>
                    Заявитель: {row.attempt.card.data.caller_name || "—"}{" "}
                    {row.attempt.card.data.caller_phone}
                  </p>
                  <p>
                    Тип: {row.attempt.classifier_entry?.name || "Не выбран"}
                  </p>
                  <p>
                    Оповещены:{" "}
                    {row.attempt.notified_services
                      .map((s) => s.name)
                      .join(", ") || "—"}
                  </p>
                  <details>
                    <summary>Все заполненные поля</summary>
                    <CardDataFields data={row.attempt.card.data} />
                  </details>
                </>
              ) : (
                <p>Не начата</p>
              )}
            </section>
          </div>
          {row.automatic_check && (
            <AutomaticCheckView check={row.automatic_check} />
          )}
          {row.attempt && (
            <AuditTrail
              lessonId={data.lesson_id}
              studentId={data.student_id}
              attemptId={row.attempt.id}
            />
          )}
          {row.attempt && renderProctoring?.(row.attempt.id)}
        </Paper>
      ))}
      {data.evaluations.length > 1 && (
        <details>
          <summary>История оценок ({data.evaluations.length})</summary>
          <Stack spacing={1}>
            {data.evaluations.slice(0, -1).map((grade) => (
              <GradeView key={grade.id} grade={grade} />
            ))}
          </Stack>
        </details>
      )}
      <details>
        <summary>Пересмотр преподавателем</summary>
        <GradeForm key={latest?.revision ?? 0} data={data} reload={reload} />
      </details>
    </Stack>
  );
}
function GradeForm({ data, reload }: { data: WorkReview; reload: () => void }) {
  const client = useQueryClient();
  const latest = data.evaluations.at(-1);
  const [score, setScore] = useState(latest?.score ?? "");
  const [max, setMax] = useState(latest?.max_score ?? "100");
  const [comment, setComment] = useState(latest?.comment ?? "");
  const [requestId, setRequestId] = useState(() => randomUUID());
  const save = useMutation({
    mutationFn: () =>
      trainingApi.grade(data.lesson_id, data.student_id, {
        request_id: requestId,
        expected_revision: latest?.revision ?? 0,
        score: Number(score),
        max_score: Number(max),
        comment,
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["work-review", data.lesson_id, data.student_id],
      });
      void client.invalidateQueries({ queryKey: ["lessons"] });
      void client.invalidateQueries({ queryKey: ["analytics"] });
      void client.invalidateQueries({ queryKey: ["attempt-audit"] });
      void client.invalidateQueries({
        queryKey: ["evaluation", data.lesson_id],
      });
    },
  });
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Typography variant="h6" component="h2">
        Ручное оценивание
      </Typography>
      {!data.submitted && (
        <Alert severity="info">
          Выставить оценку можно после сдачи всех карточек.
        </Alert>
      )}
      <Stack direction="row" spacing={2}>
        <TextField
          required
          type="number"
          label="Балл"
          value={score}
          slotProps={{ htmlInput: { min: 0, max: Number(max), step: "0.01" } }}
          onChange={(e) => {
            setScore(e.target.value);
            setRequestId(randomUUID());
          }}
        />
        <TextField
          required
          type="number"
          label="Максимальный балл"
          value={max}
          slotProps={{ htmlInput: { min: 0.01, step: "0.01" } }}
          onChange={(e) => {
            setMax(e.target.value);
            setRequestId(randomUUID());
          }}
        />
      </Stack>
      <TextField
        required
        label="Комментарий преподавателя"
        multiline
        minRows={3}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setRequestId(randomUUID());
        }}
      />
      {save.error && (
        <Alert
          severity="error"
          action={<Button onClick={reload}>Загрузить актуальную оценку</Button>}
        >
          {getApiError(save.error).message}
        </Alert>
      )}
      {save.isSuccess && <Alert severity="success">Оценка сохранена</Alert>}
      <Button type="submit" disabled={!data.submitted || save.isPending}>
        Сохранить оценку
      </Button>
    </Stack>
  );
}
