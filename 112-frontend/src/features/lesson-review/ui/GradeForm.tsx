import { reviewApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { randomUUID } from "@/shared/lib/uuid";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { GradeFormProps } from "../types/LessonReview";

export function GradeForm({ data, reload }: GradeFormProps) {
  const client = useQueryClient();
  const latest = data.evaluations.at(-1);
  const [score, setScore] = useState(latest?.score ?? "");
  const [max, setMax] = useState(latest?.max_score ?? "100");
  const [comment, setComment] = useState(latest?.comment ?? "");
  const [requestId, setRequestId] = useState(() => randomUUID());
  const save = useMutation({
    mutationFn: () =>
      reviewApi.grade(data.lesson_id, data.student_id, {
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
      void client.invalidateQueries({ queryKey: ["student-overview"] });
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
      onSubmit={(event) => {
        event.preventDefault();
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
          onChange={(event) => {
            setScore(event.target.value);
            setRequestId(randomUUID());
          }}
        />
        <TextField
          required
          type="number"
          label="Максимальный балл"
          value={max}
          slotProps={{ htmlInput: { min: 0.01, step: "0.01" } }}
          onChange={(event) => {
            setMax(event.target.value);
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
        onChange={(event) => {
          setComment(event.target.value);
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
