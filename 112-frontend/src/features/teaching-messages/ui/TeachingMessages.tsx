import { messageApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { useStudentMessages } from "../model/useStudentMessages";
import { StudentMessage } from "./StudentMessage";
import {
  ValidatedForm,
  ValidatedTextField as TextField,
} from "@/shared/ui/form-validation";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/TeachingMessages";
import type {
  MessageComposerProps,
  StudentMessagesProps,
} from "../types/TeachingMessages";

export function MessageComposer({ groupId, studentId }: MessageComposerProps) {
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () =>
      messageApi.send(
        text,
        groupId ? { group_id: groupId } : { student_id: studentId },
      ),
    onSuccess: () => setText(""),
  });
  return (
    <ValidatedForm
      spacing={1}
      error={send.error}
      onSubmit={() => send.mutate()}
    >
      <TextField
        name="text"
        required
        label={groupId ? "Объявление для группы" : "Комментарий ученику"}
        multiline
        minRows={2}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          send.reset();
        }}
        slotProps={{ htmlInput: { maxLength: 4000 } }}
      />
      <Button disabled={send.isPending} type="submit">
        Отправить комментарий
      </Button>
      {send.isSuccess && (
        <Alert severity="success">
          Отправлено. Получателей: {send.data.recipient_count}
        </Alert>
      )}
    </ValidatedForm>
  );
}

export function StudentMessages({
  compact = false,
  unreadOnly = false,
}: StudentMessagesProps) {
  const { page, setPage, query, read } = useStudentMessages(
    compact,
    unreadOnly,
  );
  return (
    <Paper
      component={compact ? "details" : "section"}
      variant="outlined"
      sx={styles.paper(compact)}
    >
      {compact && (
        <summary style={styles.summary}>
          Сообщения преподавателя · {query.data?.total ?? 0}
        </summary>
      )}
      <Stack spacing={1}>
        <Typography variant="h6">
          {unreadOnly
            ? "Непрочитанные сообщения"
            : compact
              ? "Сообщения преподавателя"
              : "Сообщения и рекомендации"}
        </Typography>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          {query.data?.items.length === 0 && (
            <Typography color="text.secondary">
              {unreadOnly
                ? "Непрочитанных сообщений нет"
                : "Сообщений пока нет"}
            </Typography>
          )}
          {query.data?.items.map((m) => (
            <StudentMessage
              key={m.id}
              message={m}
              pending={read.isPending}
              onRead={read.mutate}
            />
          ))}
          {!!query.data?.total && (
            <PageControls
              total={query.data.total}
              page={page}
              onPage={setPage}
            />
          )}
        </QueryState>
        {read.error && (
          <Alert severity="error">{getApiError(read.error).message}</Alert>
        )}
      </Stack>
    </Paper>
  );
}
