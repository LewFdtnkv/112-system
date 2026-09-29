import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { messageApi, trainingKeys } from "@/entities/training";
import { getStudentTrainingWorkspacePath } from "@/shared/config/routes";

export function useReferralLesson() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: messageApi.createReferralLesson,
    onSuccess: ({ lesson_id }) => {
      void client.invalidateQueries({ queryKey: ["messages"] });
      void client.invalidateQueries({ queryKey: trainingKeys.lessons });
      void client.invalidateQueries({ queryKey: ["student-overview"] });
      navigate(getStudentTrainingWorkspacePath(lesson_id));
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}
