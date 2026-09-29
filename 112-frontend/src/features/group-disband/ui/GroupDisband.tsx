import { getApiError } from "@/shared/api";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Button } from "@mui/material";
import { useGroupDisband } from "../model/useGroupDisband";
import type { GroupDisbandProps } from "../types/GroupDisband";

export function GroupDisband(props: GroupDisbandProps) {
  const { open, mutation, show, close } = useGroupDisband(props);
  return (
    <>
      <Button
        color="error"
        onClick={show}
        aria-label={`Расформировать группу ${props.group.name}`}
      >
        Расформировать
      </Button>
      <ConfirmDialog
        open={open}
        title={`Расформировать группу «${props.group.name}»?`}
        description="Ученики выйдут из состава группы. Группа исчезнет из списка и станет недоступна для новых назначений. Уже назначенные занятия, ответы и оценки сохранятся; ученики смогут продолжить работу над ними."
        confirmLabel="Расформировать группу"
        confirmColor="error"
        error={mutation.error ? getApiError(mutation.error).message : undefined}
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={close}
      />
    </>
  );
}
