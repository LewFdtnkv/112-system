import type { Message } from "@/entities/training";
export type MessageComposerProps = {
  groupId?: string;
  studentId?: string;
};

export type StudentMessagesProps = { compact?: boolean; unreadOnly?: boolean };

export type StudentMessageProps = {
  message: Message;
  pending: boolean;
  onRead: (id: string) => void;
};

export type TeacherMessageDialogProps = MessageComposerProps & {
  onClose: () => void;
};
