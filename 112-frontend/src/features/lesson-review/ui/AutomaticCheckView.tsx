import {
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
export function AutomaticCheckView({ check }: { check: AutomaticCheck }) {
  return (
    <Stack spacing={1} sx={{ mt: 2 }}>
      <Typography component="h3" variant="h6">
        Сравнение с эталоном
      </Typography>
      <Typography variant="body2">
        Совпало: {check.matched} · Не заполнено: {check.missing} · Расхождений:{" "}
        {check.different} · Проверить смысл: {check.needs_review}
      </Typography>
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
    </Stack>
  );
}
