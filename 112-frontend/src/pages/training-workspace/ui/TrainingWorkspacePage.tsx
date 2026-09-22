import { studentLessonQueryOptions } from "@/entities/training";
import { QueryState } from "@/shared/ui/QueryState";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Workspace } from "./Workspace";
export const TrainingWorkspacePage = () => {
  const { sessionId } = useParams();
  const lesson = useQuery(studentLessonQueryOptions(sessionId!));
  return (
    <QueryState
      pending={lesson.isPending}
      error={lesson.error}
      retry={() => void lesson.refetch()}
    >
      {lesson.data && <Workspace key={lesson.data.id} lesson={lesson.data} />}
    </QueryState>
  );
};
