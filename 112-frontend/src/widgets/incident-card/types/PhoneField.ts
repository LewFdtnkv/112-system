import type { InputHTMLAttributes } from "react";

export type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  /** Подпись служит ключом подсветки проверки — не менять без нужды. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
};
