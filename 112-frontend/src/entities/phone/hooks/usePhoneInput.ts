import { type ChangeEvent, useId, useMemo, useState } from "react";

import { editPhone, getPhoneIssue, type PhoneIssue } from "../ui/phone";

export function usePhoneInput(
  value: string,
  onChange: (value: string) => void,
) {
  const hintId = useId();
  const [touched, setTouched] = useState(false);
  const issue = useMemo(() => getPhoneIssue(value), [value]);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const input = event.currentTarget;
    const inputType = (event.nativeEvent as InputEvent).inputType ?? "";
    const edit = editPhone(
      input.value,
      input.selectionStart ?? input.value.length,
      value,
      inputType,
    );
    onChange(edit.value);
    queueMicrotask(() => {
      if (document.activeElement === input) {
        input.setSelectionRange(edit.caret, edit.caret);
      }
    });
  };

  const handleBlur = () => {
    setTouched(true);
    if (value.trim() === "+") onChange("");
  };

  return {
    inputProps: {
      type: "tel",
      inputMode: "tel",
      autoComplete: "off",
      spellCheck: false,
      value,
      onChange: handleChange,
      onBlur: handleBlur,
    } as const,
    issue: (touched ? issue : null) satisfies PhoneIssue | null,
    invalid: issue !== null,
    reveal: () => setTouched(true),
    hintId,
  };
}
