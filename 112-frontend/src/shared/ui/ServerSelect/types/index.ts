export interface SelectOption {
  id: string;
  label: string;
  metadata?: unknown;
}

export type ServerSelectProps = {
  label: string;
  queryKey: readonly unknown[];
  load: (search: string, signal: AbortSignal) => Promise<SelectOption[]>;
  value: SelectOption | null;
  onChange: (value: SelectOption | null) => void;
  disabled?: boolean;
};
