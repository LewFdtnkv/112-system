import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { getApiError } from "@/shared/api";
import { useState } from "react";
import { CreateMemoryDialog } from "@/features/assessment-memory-authoring";
import type { MemoryLibraryFilter } from "@/entities/training";
import { useMemoryLibrary } from "../model/useMemoryLibrary";
import { memoryKindLabels, memoryVerdictLabels } from "../model/labels";
import "../styles/assessment-memory.scss";

export function AssessmentExamples() {
  const m = useMemoryLibrary();
  const [creating, setCreating] = useState(false);
  const busy = m.toggle.isPending || m.remove.isPending;
  const error = m.toggle.error ?? m.remove.error;
  const row = m.selected;
  return (
    <Stack spacing={2}>
      <div>
        <Button variant="contained" onClick={() => setCreating(true)}>
          Создать разбор
        </Button>
      </div>
      {creating && <CreateMemoryDialog onClose={() => setCreating(false)} />}
      <Alert severity="info">
        Пересмотр балла меняет только оценку выбранной работы. Для будущих
        проверок сохраните здесь пример или нажмите «Исправить вывод ИИ» у
        критерия в результатах карточки. ИИ подбирает похожие разборы; точные
        проверки обязательных полей остаются прежними. Изменения действуют
        только для ваших занятий. История прежних оценок сохраняется.
      </Alert>
      <div className="memory-library-filters">
        <TextField
          label="Поиск по разбору"
          value={m.filter.q}
          onChange={(e) => m.change({ q: e.target.value })}
        />
        <TextField
          select
          label="Тип разбора"
          value={m.filter.kind}
          onChange={(e) =>
            m.change({ kind: e.target.value as MemoryLibraryFilter["kind"] })
          }
        >
          <MenuItem value="">Все типы</MenuItem>
          {Object.entries(memoryKindLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Использование"
          value={m.filter.state}
          onChange={(e) =>
            m.change({ state: e.target.value as MemoryLibraryFilter["state"] })
          }
        >
          <MenuItem value="all">Все</MenuItem>
          <MenuItem value="enabled">Включены</MenuItem>
          <MenuItem value="disabled">Отключены</MenuItem>
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={m.filter.include_removed}
              onChange={(_, checked) => m.change({ include_removed: checked })}
            />
          }
          label="Показывать удалённые"
        />
      </div>
      {m.query.error && (
        <Alert severity="error">
          {getApiError(m.query.error).message}{" "}
          <Button onClick={() => m.query.refetch()}>Повторить</Button>
        </Alert>
      )}
      {m.query.isLoading && <Typography>Загрузка разборов…</Typography>}
      <TableContainer component={Paper}>
        <Table
          className="memory-library-table"
          size="small"
          aria-label="Разборы в памяти ИИ"
        >
          <TableHead>
            <TableRow>
              {[
                "Тип",
                "Источник",
                "Вердикт",
                "Объяснение",
                "Использование",
              ].map((x) => (
                <TableCell key={x}>{x}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {m.query.data?.items.map((item) => (
              <TableRow
                key={item.id}
                hover
                tabIndex={0}
                className="memory-library-row"
                onClick={() => m.select(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    m.select(item);
                  }
                }}
              >
                <TableCell>{memoryKindLabels[item.kind]}</TableCell>
                <TableCell>
                  {item.source === "shared" ? "Учебный пример" : "Ваш разбор"}
                </TableCell>
                <TableCell>{memoryVerdictLabels[item.verdict]}</TableCell>
                <TableCell className="memory-library-summary">
                  {item.reason}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={item.enabled ? "success" : "default"}
                    label={
                      item.removed
                        ? "Удалён"
                        : !item.active
                          ? "Отозван"
                          : item.enabled
                            ? "Включён"
                            : "Отключён"
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {m.query.isSuccess && !m.query.data.items.length && (
          <Typography>Разборы не найдены.</Typography>
        )}
        <TablePagination
          component="div"
          count={m.query.data?.total ?? 0}
          page={m.filter.offset / 20}
          rowsPerPage={20}
          rowsPerPageOptions={[20]}
          onPageChange={(_, page) => m.change({ offset: page * 20 })}
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} из ${count}`
          }
        />
      </TableContainer>
      <Dialog
        open={!!row}
        onClose={() => !busy && m.select(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="memory-detail-title"
      >
        <DialogTitle id="memory-detail-title">Разбор в памяти ИИ</DialogTitle>
        {row && (
          <>
            <DialogContent>
              <Stack spacing={2}>
                <Typography>
                  <strong>Тип:</strong> {memoryKindLabels[row.kind]} ·{" "}
                  {row.source === "shared"
                    ? "Подготовленный учебный пример"
                    : "Ваш разбор"}
                </Typography>
                <Typography>
                  <strong>Условие:</strong> {row.condition}
                </Typography>
                <Typography>
                  <strong>Ответ ученика:</strong> {row.answer}
                </Typography>
                <Typography>
                  <strong>Вердикт:</strong> {memoryVerdictLabels[row.verdict]}
                </Typography>
                <Typography>
                  <strong>Объяснение:</strong> {row.reason}
                </Typography>
                {!row.active && (
                  <Alert severity="info">
                    Разбор отозван или заменён. Новый вариант можно сохранить в
                    результатах работы.
                  </Alert>
                )}
                {m.removing && (
                  <Alert severity="warning">
                    Удалить разбор из вашей памяти ИИ? Он перестанет
                    использоваться в новых проверках. В истории прежних оценок
                    его копия сохранится.
                  </Alert>
                )}
                {error && (
                  <Alert severity="error">{getApiError(error).message}</Alert>
                )}
              </Stack>
            </DialogContent>
            <DialogActions className="memory-library-actions">
              <Button disabled={busy} onClick={() => m.select(null)}>
                Закрыть
              </Button>
              {row.active && (
                <Button disabled={busy} onClick={() => m.toggle.mutate(row)}>
                  {row.enabled
                    ? "Отключить"
                    : row.removed
                      ? "Восстановить и включить"
                      : "Включить"}
                </Button>
              )}
              {!row.removed && (
                <Button
                  color="error"
                  disabled={busy}
                  onClick={() =>
                    m.removing ? m.remove.mutate(row) : m.setRemoving(true)
                  }
                >
                  {m.removing ? "Подтвердить удаление" : "Удалить из памяти"}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
}
