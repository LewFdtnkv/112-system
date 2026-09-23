export interface DateTimeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  min?: string;
  disabled?: boolean;
}
