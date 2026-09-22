export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

export type ChangePasswordFormProps = {
  error?: string;
  onSubmit: (values: ChangePasswordValues) => Promise<void>;
};
