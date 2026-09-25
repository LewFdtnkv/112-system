import { jobPurposes, jobStatuses } from "@/entities/ai-job";
import { TextField, MenuItem } from "@mui/material";
import type { JobFiltersProps } from "../types";
export function JobFilters({ filters, update }: JobFiltersProps) {
  return (
    <div className="ai-jobs__filters">
      <TextField
        label="Поиск по ID, пользователю или модели"
        value={filters.q}
        onChange={(e) => update("q", e.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <TextField
        select
        label="Состояние"
        value={filters.status}
        onChange={(e) => update("status", e.target.value)}
      >
        <MenuItem value="">Все состояния</MenuItem>
        {Object.entries(jobStatuses).map(([key, label]) => (
          <MenuItem key={key} value={key}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Вид задачи"
        value={filters.purpose}
        onChange={(e) => update("purpose", e.target.value)}
      >
        <MenuItem value="">Все виды</MenuItem>
        {Object.entries(jobPurposes).map(([key, label]) => (
          <MenuItem key={key} value={key}>
            {label}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
}
