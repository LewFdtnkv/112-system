import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import type { ProfileFieldsProps } from "../types/profile";
export function ProfileFields({ value, onChange }: ProfileFieldsProps) {
  return (
    <>
      {(
        [
          ["last_name", "Фамилия"],
          ["first_name", "Имя"],
          ["middle_name", "Отчество"],
        ] as const
      ).map(([key, label]) => (
        <TextField
          key={key}
          name={key}
          label={label}
          value={value[key] ?? ""}
          slotProps={{ htmlInput: { maxLength: 100 } }}
          onChange={(event) =>
            onChange({ ...value, [key]: event.target.value })
          }
        />
      ))}
    </>
  );
}
