import { type UserDetail } from "@/entities/training";
export type UserDetailsDialogProps = {
  userId: string;
  onClose: () => void;
};

export type AccountFormProps = {
  user: UserDetail;
  onClose: () => void;
  onResetPassword: () => void;
};

export type UserPasswordResetDialogProps = {
  user: Pick<UserDetail, "id" | "username">;
  onClose: () => void;
};

export type PasswordResetValues = {
  temporary_password: string;
  confirmation: string;
};
