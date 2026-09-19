import {
  Alert,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { AutomaticCheck } from "@/entities/training";

const statuses = {
  matched: ["Совпало", "success"],
  missing: ["Не заполнено", "error"],
  different: ["Расхождение", "warning"],
  needs_review: ["Проверить смысл", "info"],
} as const;
export function AutomaticCheckView({
  check,
  summary = false,
  submitted = true,
}: {
  check: AutomaticCheck | Omit<AutomaticCheck, "fields">;
  summary?: boolean;
  submitted?: boolean;
}) {
  return (
    <Stack spacing={1} sx={{ mt: 2 }}>
      <Typography component={summary ? "h2" : "h3"} variant="h6">
        {summary
          ? "Предварительная автоматическая проверка"
          : "Сравнение с эталоном"}
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>
        Предварительный балл:{" "}
        {check.score_percent === null
          ? "Нет проверяемых полей"
          : `${check.score_percent} / 100 (${check.earned_points} из ${check.possible_points} полей)`}
      </Typography>
      <Typography variant="body2">
        Совпало: {check.matched} · Не заполнено: {check.missing} · Расхождений:{" "}
        {check.different} · Проверить смысл: {check.needs_review}
      </Typography>
      {summary ? (
        <Alert severity="info">
          За каждое совпавшее структурированное поле — один балл. Процент
          рассчитан по полям с эталоном; текст сообщения и свободный адрес
          проверяет преподаватель и они не влияют на этот балл. Это
          предварительный результат, итоговую оценку выставляет преподаватель.
          {!submitted &&
            " Работа ещё не сдана полностью: показаны только начатые карточки."}
        </Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Автоматическая проверка полей">
            <TableHead>
              <TableRow>
                <TableCell>Поле</TableCell>
                <TableCell>Эталон</TableCell>
                <TableCell>Ответ ученика</TableCell>
                <TableCell>Проверка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {("fields" in check ? check.fields : []).map((field) => (
                <TableRow
                  key={field.field}
                  sx={{
                    "& td": {
                      verticalAlign: "top",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    },
                  }}
                >
                  <TableCell>
                    {field.label}
                    {!field.scored && (
                      <Typography variant="caption" sx={{ display: "block" }}>
                        Вне балла
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 330 }}>
                    {field.expected || "—"}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 330 }}>
                    {field.actual || "—"}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={statuses[field.status][0]}
                      color={statuses[field.status][1]}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
