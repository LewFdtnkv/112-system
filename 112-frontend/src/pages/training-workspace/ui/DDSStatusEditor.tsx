import { crewStatusLabels, ddsStatusLabels } from "@/entities/training";
import { getApiError } from "@/shared/api";
import {
  ArmField,
  ArmIconButton,
  ArmSelect,
  ArmTextarea,
} from "@/shared/ui/arm";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import type { DDSControlsProps } from "../types/DDSControls";

export function DDSStatusEditor({ workspace: w }: DDSControlsProps) {
  const isCrew = w.target === "crew";
  const crew = w.dds.crews?.find((c) => c.crew_code === w.crewCode);
  const options = isCrew
    ? (crew?.allowed_statuses ?? ["assigned"])
    : w.dds.allowed_statuses;
  const labels = isCrew ? crewStatusLabels : ddsStatusLabels;
  return (
    <Dialog
      open={w.editing}
      onClose={() => {
        if (!w.busy) w.setEditing(false);
      }}
      fullWidth
      maxWidth="lg"
      className="arm-aux-dialog dds-status-dialog"
    >
      <DialogTitle>
        {isCrew
          ? crew
            ? `Бригада: ${crew.name}`
            : "Назначение бригады"
          : `Статус службы: ${w.dds.profile.name}`}
        <ArmIconButton
          icon="close"
          label="Закрыть изменение статуса"
          disabled={w.busy}
          onClick={() => w.setEditing(false)}
        />
      </DialogTitle>
      <DialogContent>
        <p className="dds-source-message">{w.dds.information?.message}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            w.save.mutate();
          }}
        >
          {isCrew && !crew && (
            <ArmSelect
              label="Бригада"
              required
              value={w.crewCode}
              disabled={w.busy}
              onChange={(e) => {
                w.setCrewCode(e.target.value);
                w.changed();
              }}
            >
              <option value="">Выберите бригаду</option>
              {(w.dds.profile.crews ?? [])
                .filter(
                  (c) =>
                    c.is_active &&
                    !w.dds.crews?.some((a) => a.crew_code === c.code),
                )
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} — {c.description}
                  </option>
                ))}
            </ArmSelect>
          )}
          <ArmSelect
            label={isCrew ? "Статус бригады" : "Статус реагирования"}
            required
            value={w.status}
            disabled={w.busy}
            onChange={(e) => {
              w.setStatus(e.target.value);
              w.changed();
            }}
          >
            <option value="">Выберите статус</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </ArmSelect>
          <ArmField
            label="Номер наряда"
            value={w.number}
            maxLength={100}
            disabled={w.busy}
            onChange={(e) => {
              w.setNumber(e.target.value);
              w.changed();
            }}
          />
          <ArmTextarea
            label={isCrew ? "Комментарий бригады" : "Комментарий ДДС"}
            value={w.comment}
            required
            rows={2}
            maxLength={10000}
            disabled={w.busy}
            onChange={(e) => {
              w.setComment(e.target.value);
              w.changed();
            }}
          />
          <button
            className="arm-small-button"
            type="submit"
            disabled={
              !w.status ||
              !w.comment.trim() ||
              w.busy ||
              (isCrew && !w.crewCode)
            }
          >
            {isCrew && !crew ? "Назначить бригаду" : "Сохранить статус"}
          </button>
        </form>
        {w.save.error && (
          <p role="alert">{getApiError(w.save.error).message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
