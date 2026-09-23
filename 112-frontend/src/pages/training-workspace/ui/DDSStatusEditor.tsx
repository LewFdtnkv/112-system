import { crewStatusLabels, ddsStatusLabels } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { ArmField, ArmIconButton, ArmSelect } from "@/shared/ui/arm";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useDDSWorkspaceStore } from "../model/DDSWorkspaceContext";

export function DDSStatusEditor() {
  const w = useDDSWorkspaceStore((state) => state);
  const isCrew = w.target === "crew";
  const crew = w.dds.crews?.find((c) => c.crew_code === w.crewCode);
  const rawOptions = isCrew
    ? (crew?.allowed_statuses ?? ["assigned"])
    : w.dds.allowed_statuses;
  const options =
    w.attempt.exercise_scope &&
    !w.attempt.exercise_scope.includes("dds_response")
      ? rawOptions.filter((s) => s === "assigned" || s === "cancelled")
      : rawOptions;
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
      aria-labelledby="dds-status-title"
    >
      <DialogTitle id="dds-status-title" className="dds-status-title">
        {isCrew
          ? crew
            ? `Бригада: ${crew.name}`
            : "Назначение бригады"
          : `Статус службы: ${w.dds.profile.name}`}
      </DialogTitle>
      <DialogContent>
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
            <option value="">Статус</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </ArmSelect>
          <ArmField
            label="Номер наряда"
            placeholder="Номер наряда"
            value={w.number}
            maxLength={100}
            disabled={w.busy}
            onChange={(e) => {
              w.setNumber(e.target.value);
              w.changed();
            }}
          />
          <ArmField
            label={isCrew ? "Комментарий бригады" : "Комментарий ДДС"}
            placeholder="Комментарий"
            value={w.comment}
            required={!isCrew}
            maxLength={10000}
            disabled={w.busy}
            onChange={(e) => {
              w.setComment(e.target.value);
              w.changed();
            }}
          />
          <ArmIconButton
            icon="check"
            label={isCrew && !crew ? "Назначить бригаду" : "Сохранить статус"}
            className="dds-status-confirm"
            type="submit"
            disabled={
              !w.status ||
              (!isCrew && !w.comment.trim()) ||
              w.busy ||
              (isCrew && !w.crewCode)
            }
          />
          <ArmIconButton
            icon="close"
            label="Закрыть изменение статуса"
            disabled={w.busy}
            onClick={() => w.setEditing(false)}
          />
        </form>
        {w.save.error && (
          <p role="alert">{getApiError(w.save.error).message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
