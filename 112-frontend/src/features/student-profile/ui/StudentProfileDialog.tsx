import {
  activityApi,
  percentText,
  userName,
  UserIdentity,
} from "@/entities/training";
import { getStudentProfilePath } from "@/shared/config/routes";
import { QueryState } from "@/shared/ui/QueryState";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { styles } from "../styles/StudentProfileDialog";
import type { StudentProfileDialogProps } from "../types/StudentProfileDialog";
export function StudentProfileDialog({
  studentId,
  onClose,
}: StudentProfileDialogProps) {
  const query = useQuery({
    queryKey: ["student-overview", studentId, 0],
    queryFn: ({ signal }) => activityApi.overview(studentId, 0, signal),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="student-profile-dialog-title"
    >
      <DialogTitle id="student-profile-dialog-title">
        Профиль ученика
      </DialogTitle>
      <DialogContent>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          {query.data && (
            <Stack spacing={2} sx={styles.stack}>
              <div>
                <Typography variant="h6">
                  <UserIdentity
                    userId={query.data.user.id}
                    name={userName(query.data.user)}
                  />
                </Typography>
                <Typography color="text.secondary">
                  {query.data.groups.join(" · ") || "Без учебной группы"}
                </Typography>
              </div>
              <Typography>
                Активных уроков:{" "}
                <strong>{query.data.active_lessons.total}</strong> · Завершено:{" "}
                <strong>{query.data.performance.completed_lessons}</strong>
              </Typography>
              {query.data.performance.tracks.map((track) => (
                <Typography key={track.track}>
                  {track.track === "training"
                    ? "Тренировки"
                    : "Контрольные занятия"}
                  : <strong>{percentText(track.overall_percent)}</strong>
                  {" · Последние 5: "}
                  {percentText(track.recent_percent)}
                </Typography>
              ))}
              <Typography variant="caption" color="text.secondary">
                Учитываются уроки, назначенные вами.
              </Typography>
            </Stack>
          )}
        </QueryState>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть профиль</Button>
        <Button
          component={Link}
          to={getStudentProfilePath(studentId)}
          disabled={!query.data}
          target="_blank"
          // Internal same-origin link: inherit the teacher sessionStorage in the new tab.
          rel="opener"
          variant="contained"
        >
          Подробнее
        </Button>
      </DialogActions>
    </Dialog>
  );
}
