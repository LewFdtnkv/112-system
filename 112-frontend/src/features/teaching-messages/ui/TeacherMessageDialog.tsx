import { userApi, userName } from "@/entities/user";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import { QueryState } from "@/shared/ui/QueryState";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  loadMessageGroups,
  loadMessageStudents,
} from "../model/messageRecipients";
import type { TeacherMessageDialogProps } from "../types/TeachingMessages";
import { MessageComposer } from "./TeachingMessages";

export function TeacherMessageDialog({
  studentId,
  groupId,
  onClose,
}: TeacherMessageDialogProps) {
  const [kind, setKind] = useState<"student" | "group">("student");
  const [recipient, setRecipient] = useState<SelectOption | null>(null);
  const student = useQuery({
    queryKey: ["message-recipient", studentId],
    queryFn: ({ signal }) => userApi.get(studentId!, signal),
    enabled: !!studentId,
  });
  const target = studentId || groupId || recipient?.id;
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="teacher-message-title"
    >
      <DialogTitle id="teacher-message-title">
        {groupId
          ? "Сообщение группе"
          : studentId
            ? "Сообщение ученику"
            : "Сообщение ученику или группе"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {studentId ? (
            <QueryState
              pending={student.isPending}
              error={student.error}
              retry={() => void student.refetch()}
            >
              {student.data && (
                <Typography>Кому: {userName(student.data)}</Typography>
              )}
            </QueryState>
          ) : (
            !groupId && (
              <>
                <ToggleButtonGroup
                  exclusive
                  value={kind}
                  aria-label="Кому написать"
                  onChange={(_, value: "student" | "group" | null) => {
                    if (value && value !== kind) {
                      setKind(value);
                      setRecipient(null);
                    }
                  }}
                >
                  <ToggleButton value="student">Ученику</ToggleButton>
                  <ToggleButton value="group">Группе</ToggleButton>
                </ToggleButtonGroup>
                <ServerSelect
                  key={kind}
                  label={kind === "student" ? "Ученик" : "Группа"}
                  queryKey={["message-recipients", kind]}
                  value={recipient}
                  onChange={setRecipient}
                  load={
                    kind === "student" ? loadMessageStudents : loadMessageGroups
                  }
                />
              </>
            )
          )}
          {target && (!studentId || student.isSuccess) && (
            <MessageComposer
              key={target}
              studentId={
                studentId ||
                (!groupId && kind === "student" ? target : undefined)
              }
              groupId={
                groupId || (!studentId && kind === "group" ? target : undefined)
              }
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
