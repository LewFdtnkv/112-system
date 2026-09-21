export interface LoginValues {
  username: string;
  password: string;
}

export interface LoginFormProps {
  error?: string;
  onSubmit: (values: LoginValues) => void | Promise<void>;
}
