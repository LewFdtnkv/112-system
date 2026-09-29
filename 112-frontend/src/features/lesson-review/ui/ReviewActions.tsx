import EditNoteIcon from "@mui/icons-material/EditNote";
import HistoryIcon from "@mui/icons-material/History";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from "@mui/material";
import { useState } from "react";
import { scoreText } from "../model/scoreText";
import { styles } from "../styles/LessonReview";
import type { ReviewProps, ReviewDialog } from "../types/LessonReview";
import { GradeForm } from "./GradeForm";
import { GradeView } from "./GradeView";

export function ReviewActions({
  data,
  reload,
  actions,
}: Pick<ReviewProps, "data" | "reload" | "actions">) {
  const [dialog, setDialog] = useState<ReviewDialog | null>(null);
  const latest = data.evaluations.at(-1);
  const previous = data.evaluations.at(-2);
  return (
    <Stack spacing={1}>
      {latest?.method === "teacher" && previous && (
        <Alert severity="info">
          Пересмотрено преподавателем: {scoreText(previous.score)} /{" "}
          {scoreText(previous.max_score)} → {scoreText(latest.score)} /{" "}
          {scoreText(latest.max_score)}. Итоговая оценка и комментарий
          преподавателя показаны ниже.
        </Alert>
      )}
      <Box sx={styles.actions} role="group" aria-label="Действия с результатом">
        <Button
          startIcon={<EditNoteIcon />}
          disabled={!data.submitted}
          onClick={() => setDialog({ kind: "grade", data })}
        >
          Пересмотреть оценку
        </Button>
        {actions}
        <Button
          startIcon={<HistoryIcon />}
          disabled={!data.evaluations.length}
          onClick={() => setDialog({ kind: "history" })}
        >
          История оценок ({data.evaluations.length})
        </Button>
      </Box>
      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="review-action-title"
      >
        <DialogTitle id="review-action-title">
          {dialog?.kind === "grade"
            ? "Изменить итоговую оценку"
            : "История оценок"}
        </DialogTitle>
        <DialogContent>
          {dialog?.kind === "grade" ? (
            <GradeForm
              data={dialog.data}
              reload={() => {
                reload();
                setDialog(null);
              }}
              onSaved={() => setDialog(null)}
            />
          ) : (
            <Stack spacing={2}>
              {[...data.evaluations].reverse().map((grade) => (
                <GradeView key={grade.id} grade={grade} />
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
