import { LessonLaunch } from "@/features/lesson-launch";
import { PageHeader } from "@/shared/ui/PageHeader";
import { LessonList } from "@/widgets/lesson-list";
import { Stack } from "@mui/material";
import { useParams } from "react-router-dom";
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
