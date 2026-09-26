import { useState } from "react";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import CloseIcon from "@mui/icons-material/Close";
import { Badge, IconButton, Popover, Tooltip } from "@mui/material";
import { useMessageSummary } from "../model/useStudentMessages";
import { StudentMessages } from "./TeachingMessages";
import "../styles/student-notifications.scss";

export function StudentNotificationBell() {
  const summary = useMessageSummary();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const count = summary.data?.unread_count ?? 0;
  const label = summary.isError
    ? "Сообщения. Не удалось обновить счётчик"
    : summary.isPending
      ? "Сообщения. Загрузка"
      : count
        ? `Непрочитанные сообщения: ${count}`
        : "Сообщения. Нет непрочитанных";
  return (
    <>
      <Tooltip title={label}>
        <IconButton
          className="student-notifications__bell"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={!!anchor}
          onClick={(event) => {
            setAnchor(event.currentTarget);
            void summary.refetch();
          }}
        >
          <Badge
            badgeContent={summary.isError ? "!" : count}
            max={99}
            color={summary.isError ? "warning" : "error"}
          >
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            className: "student-notifications__panel",
            role: "dialog",
            "aria-label": "Сообщения ученика",
          },
        }}
      >
        <IconButton
          className="student-notifications__close"
          aria-label="Закрыть сообщения"
          onClick={() => setAnchor(null)}
        >
          <CloseIcon />
        </IconButton>
        {anchor && <StudentMessages unreadOnly />}
      </Popover>
    </>
  );
}
