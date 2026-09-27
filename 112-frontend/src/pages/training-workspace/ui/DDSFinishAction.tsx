import { useState } from "react";
import { getApiError } from "@/shared/api";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { useDDSWorkspaceContext } from "../model/DDSWorkspaceContext";

export function DDSFinishAction() {
  const { completed, attempt, dds, busy, finish } = useDDSWorkspaceContext();
  const [open, setOpen] = useState(false);
  if (attempt.status === "completed")
    return <span role="status">Упражнение завершено</span>;
  if (completed || !dds.can_finish) return null;
  return (
    <>
      <button
        type="button"
        className="arm-save"
        data-learning-target="submit"
        disabled={busy}
        onClick={() => {
          finish.reset();
          setOpen(true);
        }}
      >
        Завершить упражнение
      </button>
      <ConfirmDialog
        open={open}
        title="Завершить упражнение?"
        description="Ответ будет отправлен на оценивание. Невыполненные действия будут учтены в оценке."
        confirmLabel="Завершить"
        isPending={finish.isPending}
        error={finish.error ? getApiError(finish.error).message : undefined}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          finish.mutate(undefined, { onSuccess: () => setOpen(false) })
        }
      />
    </>
  );
}
