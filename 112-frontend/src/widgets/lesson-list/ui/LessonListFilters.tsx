import { lessonKindLabels, workStatusLabels } from "@/entities/training";
import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { styles } from "../styles/LessonList";
import type { LessonListFiltersProps } from "../types/LessonList";
export function LessonListFilters({
  search,
  status,
  role,
  kind,
  resultsOnly,
  refreshing,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onKindChange,
  onRefresh,
}: LessonListFiltersProps) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
      <TextField
        label="Сценарий или ученик"
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <TextField
        select
        label="Учебная роль"
        value={role}
        sx={styles.textField}
        onChange={(event) => onRoleChange(event.target.value)}
      >
        <MenuItem value="all">Все роли</MenuItem>
        <MenuItem value="operator_112">Оператор 112</MenuItem>
        <MenuItem value="dds">ДДС</MenuItem>
      </TextField>
      <TextField
        select
        label="Вид занятия"
        value={kind}
        sx={styles.textField}
        onChange={(event) => onKindChange(event.target.value)}
      >
        <MenuItem value="all">Все виды</MenuItem>
        {Object.entries(lessonKindLabels).map(([value, label]) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      {!resultsOnly && (
        <TextField
          select
          label="Статус занятия"
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <MenuItem value="all">Все статусы</MenuItem>
          {Object.entries(workStatusLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Button onClick={onRefresh} disabled={refreshing}>
        Обновить
      </Button>
    </Stack>
  );
}
