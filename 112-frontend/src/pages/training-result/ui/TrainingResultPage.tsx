import { ProctoringHistory } from "@/features/proctoring";
import { MessageComposer } from "@/features/teaching-messages";
import { Stack } from "@mui/material";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/entities/user";
import { LessonReview, StudentResult } from "@/features/lesson-review";
import { PageHeader } from "@/shared/ui/PageHeader";
import { LessonList } from "@/widgets/lesson-list";
export const TrainingResultPage = () => {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const teacher = useAuthStore((s) => s.session?.roles.includes("teacher"));
  return (
    <Stack spacing={2}>
      <PageHeader title="Результат занятия" />
      {teacher && params.get("student") && (
        <MessageComposer studentId={params.get("student")!} />
      )}
      {sessionId ? (
        teacher && params.get("student") ? (
          <LessonReview
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
