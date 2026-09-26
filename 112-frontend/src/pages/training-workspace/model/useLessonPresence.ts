import {
  lessonApi,
  trainingKeys,
  type StudentLesson,
} from "@/entities/training";
import { routePaths } from "@/shared/config/routes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export function useLessonPresence(lesson: StudentLesson) {
  const deferredLeave = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const client = useQueryClient();
  const navigate = useNavigate();
  const sessionId = lesson.presence_session_id;
  const present =
    !!sessionId && !lesson.paused_at && lesson.work_status !== "submitted";
  useEffect(() => {
    clearTimeout(deferredLeave.current);
    if (!present || !sessionId) return;
    const heartbeat = () =>
      void lessonApi.presence(lesson.id, sessionId).catch(() => {
        void client.invalidateQueries({
          queryKey: trainingKeys.studentLesson(lesson.id),
        });
      });
    const leave = () =>
      void lessonApi.leave(lesson.id, sessionId).catch(() => undefined);
    const timer = window.setInterval(heartbeat, 15000);
    window.addEventListener("pagehide", leave);
    // Route changes also leave the session; a normal rerender keeps it alive.
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      deferredLeave.current = setTimeout(leave, 0);
    };
  }, [client, lesson.id, present, sessionId]);
  const exit = useMutation({
    mutationFn: async () => {
      if (sessionId) await lessonApi.leave(lesson.id, sessionId);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["student-overview"] });
      void client.invalidateQueries({
        queryKey: trainingKeys.studentLesson(lesson.id),
      });
      navigate(routePaths.studentDashboard);
    },
  });
  return exit;
}
