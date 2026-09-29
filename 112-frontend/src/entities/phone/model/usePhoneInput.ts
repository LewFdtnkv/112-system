import { type ChangeEvent, useId, useMemo, useState } from "react";

import { editPhone, getPhoneIssue } from "../lib/phone";
import type { PhoneIssue } from "../types/phone";

/**
 * Маска и проверка телефона для управляемого поля ввода.
 *
 * Ошибка показывается только после ухода из поля (или после `reveal()`),
 * чтобы не ругаться на неполный номер посреди набора; дальше она
 * обновляется на каждое нажатие и исчезает, как только номер исправлен.
 */
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
    // React после обработчика переписывает value и сбрасывает курсор в конец;
    // возвращаем его туда, где пользователь печатал.
    queueMicrotask(() => {
      if (document.activeElement === input) {
        input.setSelectionRange(edit.caret, edit.caret);
      }
    });
  };

  const handleBlur = () => {
    setTouched(true);
    // Одинокий «+» — не номер, не оставляем его в данных.
    if (value.trim() === "+") onChange("");
  };

  return {
    inputProps: {
      type: "tel",
      inputMode: "tel",
      // Браузер иначе подставит номер самого оператора, а не заявителя.
      autoComplete: "off",
      spellCheck: false,
      value,
      onChange: handleChange,
      onBlur: handleBlur,
    } as const,
    /** Ошибка для показа пользователю: `null`, пока поле не «тронуто». */
    issue: (touched ? issue : null) satisfies PhoneIssue | null,
    /** Есть ли ошибка независимо от того, показана ли она. */
    invalid: issue !== null,
    /** Показать ошибку сразу (например, при попытке сохранить форму). */
    reveal: () => setTouched(true),
    hintId,
  };
}
