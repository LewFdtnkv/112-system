import { ArmField } from "@/shared/ui/arm";
import { usePhoneInput } from "@/entities/phone";
import type { Props } from "../types/PhoneField";

/** Поле телефона АРМ: маска, вставка в любом формате и проверка длины. */
export function PhoneField({
  label,
  value,
  onValueChange,
  disabled,
  ...rest
}: Props) {
  const phone = usePhoneInput(value, onValueChange);
  // В режиме просмотра работы ученика ошибки формата не показываем.
  const issue = disabled ? null : phone.issue;
  return (
    <>
      <ArmField
        {...rest}
        {...phone.inputProps}
        label={label}
        disabled={disabled}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? phone.hintId : undefined}
      />
      {issue && (
        <span id={phone.hintId} className="arm-phone__hint" role="status">
          {issue.message}
        </span>
      )}
    </>
  );
}
