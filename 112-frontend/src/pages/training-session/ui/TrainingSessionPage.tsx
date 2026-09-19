import { Stack } from "@mui/material";
import { useParams } from "react-router-dom";
import { PageHeader } from "@/shared/ui/PageHeader";
import { LessonList } from "@/widgets/lesson-list";
import { LessonLaunch } from "@/features/lesson-launch";
export const TrainingSessionPage = () => {
  const { sessionId } = useParams();
  return (
    <Stack spacing={2}>
      <PageHeader title={sessionId ? "Учебное занятие" : "Учебные занятия"} />
      {!sessionId && <LessonLaunch />}
      <LessonList lessonId={sessionId} />
    </Stack>
  );
};
