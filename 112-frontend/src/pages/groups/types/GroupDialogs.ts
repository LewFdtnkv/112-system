import type { GroupItem } from "@/entities/training";

export type GroupMembersDialogProps = {
  group: GroupItem | null;
  onClose: () => void;
  onDisbanded: () => void;
};
export type GroupTransferDialogProps = {
  groupId: string;
  studentId: string | null;
  onClose: () => void;
  onChanged: () => void;
};
