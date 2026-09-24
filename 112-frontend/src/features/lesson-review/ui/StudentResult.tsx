import { lessonApi, LearningSummary, reviewApi } from "@/entities/training";
import { getStudentTrainingWorkspacePath } from "@/shared/config/routes";
import { QueryState } from "@/shared/ui/QueryState";
import { Alert, Button } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { StudentResultProps } from "../types/LessonReview";
import { GradeView } from "./GradeView";

export function StudentResult({ lessonId }: StudentResultProps) {
  const grade = useQuery({
    queryKey: ["evaluation", lessonId],
    queryFn: ({ signal }) => reviewApi.evaluation(lessonId, signal),
    refetchInterval: 15000,
  });
  const lesson = useQuery({
    queryKey: ["student-lesson", lessonId],
    queryFn: ({ signal }) => lessonApi.studentLesson(lessonId, signal),
    refetchInterval: 15000,
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
      {lesson.data && (
        <LearningSummary
          policy={lesson.data.learning}
          result={lesson.data.learning_result}
        />
      )}
      {grade.data ? (
        <GradeView grade={grade.data} />
      ) : (
        <Alert severity="info">
          {lesson.data?.work_status === "submitted"
            ? "Автоматическая оценка недоступна для этой работы. Обратитесь к преподавателю"
            : "Работа ещё не сдана"}
          .
        </Alert>
      )}
      <Button component={Link} to={getStudentTrainingWorkspacePath(lessonId)}>
        Карточки занятия
      </Button>
    </QueryState>
  );
}
