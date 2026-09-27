import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { Button } from "@mui/material";
import { useState } from "react";
import type { MessageComposerProps } from "../types/TeachingMessages";
import { TeacherMessageDialog } from "./TeacherMessageDialog";

export function TeacherMessageAction(props: MessageComposerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        startIcon={<ChatBubbleOutlineIcon />}
        onClick={() => setOpen(true)}
      >
        {props.studentId
          ? "Написать ученику"
          : props.groupId
            ? "Написать группе"
            : "Написать"}
      </Button>
      {open && (
        <TeacherMessageDialog {...props} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
