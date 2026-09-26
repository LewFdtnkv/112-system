import { useLessonSession } from "../model/LessonSessionContext";
import { Alert, Button } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { getApiError } from "@/shared/api";
import type { LeaveLessonButtonProps } from "../types/LeaveLessonButton";

export function LeaveLessonButton({
  beforeLeave,
  disabled,
}: LeaveLessonButtonProps) {
  const session = useLessonSession();
  const leave = useMutation({
    mutationFn: async () => {
      await beforeLeave?.();
      await session?.leave();
    },
  });
  if (!session) return null;
  return (
    <div className="lesson-session-tools">
      {session.remaining !== null && (
        <strong role="timer">
          До конца занятия: {Math.floor(session.remaining / 60)}:
          {String(session.remaining % 60).padStart(2, "0")}
        </strong>
      )}
      <Button
        disabled={disabled || leave.isPending || session.leaving}
        onClick={() => leave.mutate()}
      >
        Выйти из занятия
      </Button>
      {leave.error && (
        <Alert severity="error">{getApiError(leave.error).message}</Alert>
      )}
    </div>
  );
}
