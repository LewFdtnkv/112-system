import { activityApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      activityApi.send(
        text,
        groupId ? { group_id: groupId } : { student_id: studentId },
      ),
    onSuccess: () => setText(""),
  });
  return (
    <Stack spacing={1}>
      <TextField
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
      <Button
        disabled={!text.trim() || send.isPending}
        onClick={() => send.mutate()}
      >
        Отправить комментарий
      </Button>
      {send.error && (
        <Alert severity="error">{getApiError(send.error).message}</Alert>
      )}
      {send.isSuccess && (
        <Alert severity="success">
          Отправлено. Получателей: {send.data.recipient_count}
        </Alert>
      )}
    </Stack>
  );
}

export function StudentMessages({ compact = false }: StudentMessagesProps) {
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messages", page],
    queryFn: () => activityApi.messages(page * 20),
    refetchInterval: 5000,
  });
  const read = useMutation({
    mutationFn: activityApi.readMessage,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["messages"] });
    },
  });
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
        <Typography variant="h6">Сообщения преподавателя</Typography>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          {query.data?.items.length === 0 && (
            <Typography color="text.secondary">Сообщений пока нет</Typography>
          )}
          {query.data?.items.map((m) => (
            <Alert
              key={m.id}
              severity={m.read_at ? "info" : "warning"}
              action={
                !m.read_at && (
                  <Button
                    disabled={read.isPending}
                    onClick={() => read.mutate(m.id)}
                  >
                    Прочитано
                  </Button>
                )
              }
            >
              <strong>
                {m.teacher_name} · {m.group_name ?? "Лично вам"}
              </strong>
              <Typography sx={styles.typography}>{m.text}</Typography>
              <small>{new Date(m.created_at).toLocaleString("ru-RU")}</small>
            </Alert>
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
