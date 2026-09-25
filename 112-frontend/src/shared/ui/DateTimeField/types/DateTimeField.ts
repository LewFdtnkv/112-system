export interface DateTimeFieldProps {
  label: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  min?: string;
  disabled?: boolean;
}
