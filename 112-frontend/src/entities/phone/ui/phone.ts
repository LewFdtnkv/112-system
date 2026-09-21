import { AsYouType, validatePhoneNumberLength } from "libphonenumber-js/min";
const MAX_DIGITS = 15;
const MAX_DIGITS_RU = 11;

export const digitsOf = (text: string) => text.replace(/\D/g, "");

const capDigits = (digits: string) =>
  digits.slice(0, digits.startsWith("7") ? MAX_DIGITS_RU : MAX_DIGITS);

export function normalizePhoneDigits(text: string): string {
  const digits = digitsOf(text);
  if (!digits) return "";
  if (text.trimStart().startsWith("+")) return capDigits(digits);
  if (digits.startsWith("8")) return capDigits(`7${digits.slice(1)}`);
  return capDigits(digits.startsWith("7") ? digits : `7${digits}`);
}

/** Форматирует цифры с кодом страны: «7900123» → «+7 900 123». */
export function formatPhoneDigits(digits: string): string {
  if (!digits) return "";
  if (digits.startsWith("7")) {
    const n = digits.slice(1);
    let out = "+7";
    if (n.length > 0) out += ` ${n.slice(0, 3)}`;
    if (n.length > 3) out += ` ${n.slice(3, 6)}`;
    if (n.length > 6) out += `-${n.slice(6, 8)}`;
    if (n.length > 8) out += `-${n.slice(8, 10)}`;
    return out;
  }
  return new AsYouType().input(`+${digits}`);
}

/** Приводит произвольную строку (вставку, старое значение) к каноническому виду. */
export const formatPhone = (text: string) =>
  formatPhoneDigits(normalizePhoneDigits(text));

/** Индекс в `formatted` сразу после `count`-й цифры. */
export function caretAfterDigits(formatted: string, count: number): number {
  if (count <= 0) return formatted.startsWith("+") ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (formatted[i] >= "0" && formatted[i] <= "9") {
      seen += 1;
      if (seen === count) return i + 1;
    }
  }
  return formatted.length;
}

export interface PhoneEdit {
  value: string;
  caret: number;
}

/**
 * Результат правки поля: новое значение и позиция курсора.
 *
 * @param raw       значение поля сразу после действия пользователя
 * @param caret     позиция курсора в `raw`
 * @param previous  значение поля до действия
 * @param inputType `InputEvent.inputType` (нужен для Backspace/Delete)
 */
export function editPhone(
  raw: string,
  caret: number,
  previous: string,
  inputType = "",
): PhoneEdit {
  const hasPlus = raw.trimStart().startsWith("+");
  let digits = digitsOf(raw);
  let before = digitsOf(raw.slice(0, caret)).length;

  // Backspace/Delete по разделителю ничего не меняет в цифрах — вместо этого
  // удаляем ближайшую цифру, иначе первое нажатие «залипает».
  if (digits === digitsOf(previous)) {
    if (inputType === "deleteContentBackward" && before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before);
      before -= 1;
    } else if (inputType === "deleteContentForward" && before < digits.length) {
      digits = digits.slice(0, before) + digits.slice(before + 1);
    }
  }

  if (!hasPlus) {
    if (digits.startsWith("8")) {
      digits = `7${digits.slice(1)}`;
    } else if (digits && !digits.startsWith("7")) {
      digits = `7${digits}`;
      before += 1;
    }
  }
  digits = capDigits(digits);
  before = Math.min(before, digits.length);

  if (!digits) {
    // Одинокий «+» сохраняем, только если его набрали, а не стёрли до него.
    const keepPlus = hasPlus && !inputType.startsWith("delete");
    return keepPlus ? { value: "+", caret: 1 } : { value: "", caret: 0 };
  }

  const value = formatPhoneDigits(digits);
  return { value, caret: caretAfterDigits(value, before) };
}

export type PhoneIssueCode =
  | "incomplete"
  | "too-long"
  | "invalid-length"
  | "unknown-country"
  | "not-a-number";

export interface PhoneIssue {
  code: PhoneIssueCode;
  message: string;
}

const issueCodes = {
  TOO_SHORT: "incomplete",
  TOO_LONG: "too-long",
  INVALID_LENGTH: "invalid-length",
  INVALID_COUNTRY: "unknown-country",
  NOT_A_NUMBER: "not-a-number",
} as const satisfies Record<string, PhoneIssueCode>;

const issueMessages: Record<PhoneIssueCode, string> = {
  incomplete: "Неполный номер",
  "too-long": "Слишком длинный номер",
  "invalid-length": "Неверное количество цифр",
  "unknown-country": "Неизвестный код страны",
  "not-a-number": "Некорректный номер",
};

/**
 * Проверяет структуру номера: код страны и длину.
 * План нумерации намеренно не проверяется — в учебных сценариях
 * используются вымышленные номера («+7 000 000-00-00»).
 * Пустое значение не считается ошибкой: поле необязательное.
 */
export function getPhoneIssue(value: string): PhoneIssue | null {
  if (!digitsOf(value)) return null;
  const reason = validatePhoneNumberLength(value.trim(), "RU");
  if (!reason) return null;

  const code = issueCodes[reason];
  if (code === "incomplete") {
    const digits = normalizePhoneDigits(value);
    if (digits.startsWith("7")) {
      const missing = MAX_DIGITS_RU - digits.length;
      return {
        code,
        message: `${issueMessages[code]}: не хватает ${missing} ${missing === 1 ? "цифры" : "цифр"}`,
      };
    }
  }
  return { code, message: issueMessages[code] };
}
