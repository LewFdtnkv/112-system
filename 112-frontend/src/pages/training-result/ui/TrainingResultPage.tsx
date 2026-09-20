import { ProctoringHistory } from "@/features/proctoring";
import { MessageComposer } from "@/features/teaching-messages";
import { Button, Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import { TrainingCardPreview } from "@/widgets/incident-card";
import {
  comparisonFeedback,
  type ReviewedCard,
} from "@/features/lesson-review";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/entities/user";
import { LessonReview, StudentResult } from "@/features/lesson-review";
import { PageHeader } from "@/shared/ui/PageHeader";
import { LessonList } from "@/widgets/lesson-list";
export const TrainingResultPage = () => {
  const [preview, setPreview] = useState<{
    rows: ReviewedCard[];
    index: number;
    side: "actual" | "expected";
  }>();
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const teacher = useAuthStore((s) => s.session?.roles.includes("teacher"));
  const current = preview?.rows[preview.index];
  return (
    <Stack spacing={2}>
      <PageHeader title="Результат занятия" />
      {preview && current && (
        <TrainingCardPreview
          key={`${current.assignment_id}:${preview.side}`}
          {...(preview.side === "actual" && current.attempt
            ? {
                attempt: current.attempt,
                feedback: comparisonFeedback(current),
              }
            : {
                reference: {
                  id: current.assignment_id,
                  title: current.source_snapshot?.title ?? "Карточка",
                  data:
                    preview.side === "expected"
                      ? (current.source_snapshot?.data ?? {
                          additional_fields: {},
                        })
                      : { additional_fields: {} },
                  classifier_entry:
                    preview.side === "expected"
                      ? current.source_classifier_entry
                      : null,
                  recipients:
                    preview.side === "expected"
                      ? current.source_snapshot?.recipients
                      : [],
                },
                unanswered: preview.side === "actual",
              })}
          onClose={() => setPreview(undefined)}
          navigation={
            <nav
              className="arm-review-navigation"
              aria-label="Навигация по карточкам работы"
            >
              <div className="arm-review-navigation__cards">
                <Button
                  disabled={preview.index === 0}
                  onClick={() =>
                    setPreview({ ...preview, index: preview.index - 1 })
                  }
                >
                  ← Предыдущая карточка
                </Button>
                <strong aria-live="polite">
                  Карточка {preview.index + 1} из {preview.rows.length} ·{" "}
                  {current.source_snapshot?.title ?? "Без названия"}
                </strong>
                <Button
                  disabled={preview.index === preview.rows.length - 1}
                  onClick={() =>
                    setPreview({ ...preview, index: preview.index + 1 })
                  }
                >
                  Следующая карточка →
                </Button>
              </div>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={preview.side}
                aria-label="Режим просмотра карточки"
                onChange={(_, side: "actual" | "expected" | null) =>
                  side && setPreview({ ...preview, side })
                }
              >
                <ToggleButton value="actual">Ответ ученика</ToggleButton>
                <ToggleButton
                  value="expected"
                  disabled={!current.source_snapshot}
                >
                  Эталонное решение
                </ToggleButton>
              </ToggleButtonGroup>
            </nav>
          }
        />
      )}
      {teacher && params.get("student") && (
        <MessageComposer studentId={params.get("student")!} />
      )}
      {sessionId ? (
        teacher && params.get("student") ? (
          <LessonReview
            renderCardActions={(row, rows) => (
              <Stack direction="row" spacing={1}>
                <Button
                  disabled={!row.attempt}
                  onClick={() =>
                    setPreview({
                      rows,
                      index: rows.indexOf(row),
                      side: "actual",
                    })
                  }
                >
                  Ответ в АРМ
                </Button>
                <Button
                  disabled={!row.source_snapshot}
                  onClick={() =>
                    setPreview({
                      rows,
                      index: rows.indexOf(row),
                      side: "expected",
                    })
                  }
                >
                  Эталонное решение в АРМ
                </Button>
              </Stack>
            )}
            renderProctoring={(attemptId) => (
              <ProctoringHistory attemptId={attemptId} />
            )}
            lessonId={sessionId}
            studentId={params.get("student")!}
          />
        ) : teacher ? (
          <LessonList lessonId={sessionId} />
        ) : (
          <StudentResult lessonId={sessionId} />
        )
      ) : (
        <LessonList student={!teacher} resultsOnly />
      )}
    </Stack>
  );
};
