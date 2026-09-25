import type { FieldIssue } from "../types";

export function inputMessage(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
) {
  const v = input.validity;
  if (v.valueMissing || (input.required && !input.value.trim()))
    return "Заполните это поле.";
  if (v.badInput || v.typeMismatch)
    return input.type === "email"
      ? "Введите email, например name@example.ru."
      : "Введите значение в указанном формате.";
  if (input instanceof HTMLInputElement) {
    if (v.rangeUnderflow) return `Введите значение не меньше ${input.min}.`;
    if (v.rangeOverflow) return `Введите значение не больше ${input.max}.`;
    if (v.stepMismatch)
      return input.step === "1" || !input.step
        ? "Введите целое число."
        : `Допустимый шаг: ${input.step}.`;
  }
  if (
    !(input instanceof HTMLSelectElement) &&
    (v.tooShort ||
      (input.value.length > 0 &&
        input.minLength > 0 &&
        input.value.length < input.minLength))
  )
    return `Введите не менее ${input.minLength} символов.`;
  if (
    !(input instanceof HTMLSelectElement) &&
    (v.tooLong ||
      (input.maxLength >= 0 && input.value.length > input.maxLength))
  )
    return `Введите не более ${input.maxLength} символов.`;
  if (v.patternMismatch)
    return (
      "Проверьте формат: " +
      (input.getAttribute("title") || "используйте допустимые символы.")
    );
  return v.valid ? undefined : "Проверьте значение поля.";
}

export function nativeIssues(form: HTMLFormElement): FieldIssue[] {
  return Array.from(form.elements).flatMap((element) => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) ||
      !element.willValidate
    )
      return [];
    const message = inputMessage(element);
    const label = element.closest<HTMLElement>("[data-validation-label]")
      ?.dataset.validationLabel;
    return message
      ? [
          {
            path: element.name || element.id,
            message: label ? `${label}: ${message}` : message,
          },
        ]
      : [];
  });
}

export function focusIssue(root: HTMLElement | null, path?: string) {
  if (!root || !path) return;
  const fields = Array.from(
    root.querySelectorAll<HTMLElement>("[data-validation-field]"),
  );
  const field = fields.find((e) => e.dataset.validationField === path);
  for (
    let parent = field?.parentElement;
    parent && root.contains(parent);
    parent = parent.parentElement
  ) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  const target =
    field?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [role="combobox"], button:not(:disabled)',
    ) ?? field;
  target?.scrollIntoView?.({
    block: "center",
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
  target?.focus({ preventScroll: true });
}
