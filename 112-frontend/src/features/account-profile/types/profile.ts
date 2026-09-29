import type { UserDetail, UserUpdate } from "@/entities/user";
export type ProfileValues = Pick<
  UserUpdate,
  "first_name" | "last_name" | "middle_name"
>;
export type ProfileFieldsProps = {
  value: ProfileValues;
  onChange: (value: ProfileValues) => void;
};
export type ProfilePhotoProps = { userId: string; own?: boolean };
export type ProfileFormProps = { user: UserDetail; onClose: () => void };
export type ProfileDialogProps = { onClose: () => void };
