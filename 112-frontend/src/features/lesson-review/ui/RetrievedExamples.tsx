import { useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { getApiError } from "@/shared/api";
import { useRetrievedExamples } from "../model/useAssessmentMemory";
import { semanticLabels } from "../model/semanticLabels";
import type { RetrievedExamplesProps } from "../types/AssessmentMemory";

export function RetrievedExamples({ target }: RetrievedExamplesProps) {
  const [open, setOpen] = useState(false);
  const query = useRetrievedExamples(target, open);
  const examples = Object.values(query.data ?? {}).flat();
  return (
    <Stack spacing={1}>
      <Button aria-expanded={open} onClick={() => setOpen(!open)}>
        {open
          ? "Скрыть использованные разборы"
          : "Показать использованные разборы"}
      </Button>
      {open && (
        <>
          {query.isLoading && <Typography>Загрузка разборов…</Typography>}
          {query.error && (
            <Alert severity="error">
              {getApiError(query.error).message}{" "}
              <Button onClick={() => query.refetch()}>Повторить</Button>
            </Alert>
          )}
          {query.isSuccess && !examples.length && (
            <Typography>
              Подходящие разборы не использовались. Применены стандартные
              примеры.
            </Typography>
          )}
          {examples.map((e, index) => (
            <Alert key={`${e.id}-${index}`} severity="info">
              <strong>
                {e.source_key.startsWith("bootstrap-")
                  ? "Подготовленный учебный пример"
                  : "Разбор преподавателя"}
                : {semanticLabels[e.verdict]}
              </strong>
              <p>Условие: {e.condition}</p>
              <p>Ответ: {e.answer}</p>
              <p>{e.reason}</p>
            </Alert>
          ))}
        </>
      )}
    </Stack>
  );
}
