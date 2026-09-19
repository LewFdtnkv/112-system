import { useState } from "react";
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
  type CardData,
  type Grade,
  type WorkReview,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { getStudentTrainingWorkspacePath } from "@/shared/config/routes";
import { QueryState } from "@/shared/ui/QueryState";
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
            ? "Ожидает проверки преподавателем"
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
        Оценка преподавателя: {grade.score} / {grade.max_score}
      </Typography>
      <p style={{ whiteSpace: "pre-wrap" }}>{grade.comment}</p>
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
}: {
  lessonId: string;
  studentId: string;
}) {
  const query = useQuery({
    queryKey: ["work-review", lessonId, studentId],
    queryFn: ({ signal }) => trainingApi.review(lessonId, studentId, signal),
  });
  return (
    <QueryState
      pending={query.isPending}
      error={query.error}
      retry={() => void query.refetch()}
    >
      {query.data && (
        <Review data={query.data} reload={() => void query.refetch()} />
      )}
    </QueryState>
  );
}
function Review({ data, reload }: { data: WorkReview; reload: () => void }) {
  const latest = data.evaluations.at(-1);
  return (
    <Stack spacing={2}>
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
                    <DataFields data={row.attempt.card.data} />
                  </details>
                </>
              ) : (
                <p>Не начата</p>
              )}
            </section>
          </div>
        </Paper>
      ))}
      {latest && <GradeView grade={latest} />}
      <GradeForm key={latest?.revision ?? 0} data={data} reload={reload} />
    </Stack>
  );
}
function GradeForm({ data, reload }: { data: WorkReview; reload: () => void }) {
  const client = useQueryClient();
  const latest = data.evaluations.at(-1);
  const [score, setScore] = useState(latest?.score ?? "");
  const [max, setMax] = useState(latest?.max_score ?? "100");
  const [comment, setComment] = useState(latest?.comment ?? "");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
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
            setRequestId(crypto.randomUUID());
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
            setRequestId(crypto.randomUUID());
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
          setRequestId(crypto.randomUUID());
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

const fieldLabels: Record<string, string> = {
  caller_name: "Заявитель",
  caller_phone: "Телефон",
  caller_details: "Телефоны",
  callerId: "АОН",
  provided: "Предоставленный",
  onSite: "На месте",
  address_text: "Адрес",
  address_details: "Сведения об адресе",
  description: "Сообщение",
  victim_details: "Пострадавшие",
  features: "Признаки",
  victimsCount: "Количество пострадавших",
  additional_fields: "Дополнительные сведения",
  details: "Уточнения",
  operatorAction: "Комментарий оператора",
  country: "Страна",
  region: "Субъект",
  locality: "Населённый пункт",
  object: "Объект",
  district: "Округ",
  area: "Район",
  street: "Улица",
  house: "Дом",
  building: "Корпус",
  structure: "Строение",
  apartment: "Квартира",
  entrance: "Подъезд",
  floor: "Этаж",
  doorCode: "Код",
  classificationDescription: "Уточнение типа",
  callerStatus: "Статус заявителя",
  callerGender: "Пол",
  callerAge: "Возраст",
  foreignLanguage: "Иностранный язык",
  refusedAmbulance: "Отказ от скорой",
  blocked: "Заблокированные",
  clarifications: "Уточняющие признаки",
  has_victims: "Есть пострадавшие",
};
function DataFields({ data }: { data: CardData }) {
  const flatten = (value: unknown, prefix: string): [string, string][] => {
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value)) return [[prefix, value.map(String).join(", ")]];
    if (typeof value === "object")
      return Object.entries(value).flatMap(([k, v]) =>
        flatten(v, [prefix, fieldLabels[k] ?? k].filter(Boolean).join(" / ")),
      );
    return [
      [
        prefix,
        typeof value === "boolean" ? (value ? "Да" : "Нет") : String(value),
      ],
    ];
  };
  return (
    <dl>
      {flatten(data, "").map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
