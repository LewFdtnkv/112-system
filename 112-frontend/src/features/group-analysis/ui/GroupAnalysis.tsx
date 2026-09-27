import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TextField,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { getApiError } from "@/shared/api";
import { QueryState } from "@/shared/ui/QueryState";
import { lessonKindLabels, type LessonKind } from "@/entities/training";
import { styles } from "../styles/GroupAnalysis";
import { useGroupAnalysis } from "../model/useGroupAnalysis";
import type { GroupAnalysisProps } from "../types";

export function GroupAnalysis({ groupId, groupName }: GroupAnalysisProps) {
  const m = useGroupAnalysis(groupId);
  const data = m.report.data;
  const pending = ["queued", "running"].includes(data?.job?.status ?? "");
  return (
    <>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          m.setOpen(true);
        }}
      >
        Разбор группы
      </Button>
      <Dialog
        onClick={(e) => e.stopPropagation()}
        open={m.open}
        onClose={() => m.setOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Разбор группы · {groupName}</DialogTitle>
        <DialogContent sx={styles.content}>
          <Stack spacing={2}>
            <TextField
              select
              label="Оператор"
              value={m.role}
              onChange={(e) => m.setRole(e.target.value)}
            >
              <MenuItem value="dds">ДДС</MenuItem>
              <MenuItem value="operator_112">112</MenuItem>
            </TextField>
            <TextField
              select
              label="Период занятий"
              value={m.days}
              onChange={(e) => m.setDays(Number(e.target.value))}
            >
              {[30, 90, 365].map((n) => (
                <MenuItem key={n} value={n}>
                  Последние {n} дней
                </MenuItem>
              ))}
            </TextField>
            <QueryState
              pending={m.report.isPending}
              error={m.report.error}
              retry={() => void m.report.refetch()}
            >
              {data && (
                <>
                  {!!data.teacher_reviewed_cards && (
                    <Alert severity="info">
                      Карточек в занятиях с ручным пересмотром:{" "}
                      {data.teacher_reviewed_cards}. Их автоматические ошибки не
                      включены в сводку: итог преподавателя имеет приоритет.
                    </Alert>
                  )}
                  <TableContainer>
                    <Table aria-label="Ошибки группы">
                      <TableHead>
                        <TableRow>
                          <TableCell>Навык / формат</TableCell>
                          <TableCell>Ученики с ошибками</TableCell>
                          <TableCell>Карточки с ошибками</TableCell>
                          <TableCell>Примеры</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.statistics.map((s) => (
                          <TableRow key={`${s.kind}:${s.skill}`}>
                            <TableCell>
                              {s.label}
                              <Typography variant="body2">
                                {lessonKindLabels[s.kind as LessonKind] ??
                                  s.kind}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {s.affected} из {s.students}
                            </TableCell>
                            <TableCell>
                              {s.failed_cards} из {s.cards}
                            </TableCell>
                            <TableCell>
                              {s.examples.map((e, i) => (
                                <Button
                                  key={i}
                                  component={Link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  to={`/results/${encodeURIComponent(e.lesson_id)}?student=${encodeURIComponent(e.student_id)}`}
                                >
                                  Карточка {e.position}: {e.label}
                                </Button>
                              ))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {!data.statistics.length && (
                    <Typography>
                      Проверенных работ за выбранный период пока нет.
                    </Typography>
                  )}
                  <Button
                    disabled={
                      pending ||
                      m.create.isPending ||
                      !data.statistics.some((s) => s.failed_cards)
                    }
                    onClick={() => m.create.mutate()}
                  >
                    {pending
                      ? "Разбор ИИ готовится…"
                      : "Подготовить рекомендации ИИ"}
                  </Button>
                  {data.job?.obsolete && (
                    <Alert severity="warning">
                      Результаты изменились. Подготовьте рекомендации заново.
                    </Alert>
                  )}
                  {data.job?.mode === "methodical_fallback" && (
                    <Alert severity="info">
                      ИИ недоступен. Показаны методические рекомендации по
                      выявленным ошибкам.
                    </Alert>
                  )}
                  {data.job?.status === "failed" && (
                    <Alert severity="error">
                      Не удалось подготовить рекомендации. Можно повторить
                      запрос.
                    </Alert>
                  )}
                  {!data.job?.obsolete &&
                    data.job?.recommendations.map((r) => (
                      <Alert severity="info" key={r.id}>
                        {r.text}
                      </Alert>
                    ))}
                </>
              )}
            </QueryState>
            {m.create.error && (
              <Alert severity="error">
                {getApiError(m.create.error).message}
              </Alert>
            )}
            <Button onClick={() => m.setOpen(false)}>Закрыть</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
