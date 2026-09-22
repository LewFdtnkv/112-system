import { type UserDetail } from "@/entities/training";
export type UserDetailsDialogProps = {
  userId: string;
  onClose: () => void;
};

export type AccountFormProps = {
  user: UserDetail;
  onClose: () => void;
};
