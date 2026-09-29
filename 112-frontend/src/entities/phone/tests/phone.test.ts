import { describe, expect, it } from "vitest";

import {
  caretAfterDigits,
  editPhone,
  formatPhone,
  getPhoneIssue,
  type PhoneEdit,
} from "../lib/phone";

const typeInto = (text: string, start = ""): PhoneEdit => {
  let state: PhoneEdit = { value: start, caret: start.length };
  for (const char of text) {
    const raw = state.value + char;
    state = editPhone(raw, raw.length, state.value, "insertText");
  }
  return state;
};

describe("formatPhone", () => {
  it.each([
    ["8 (900) 123-45-67", "+7 900 123-45-67"],
    ["89001234567", "+7 900 123-45-67"],
    ["9001234567", "+7 900 123-45-67"],
    ["+7 (900) 123-45-67", "+7 900 123-45-67"],
    ["+79001234567", "+7 900 123-45-67"],
    ["7 900 123 45 67", "+7 900 123-45-67"],
    ["8 800 555-35-35", "+7 800 555-35-35"],
  ])("приводит %s к %s", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it("форматирует номера других стран без российских дефисов", () => {
    expect(formatPhone("+375291234567")).toBe("+375 29 123 45 67");
    expect(formatPhone("+442079460958")).toBe("+44 20 7946 0958");
  });

  it("отбрасывает лишние цифры российского номера", () => {
    expect(formatPhone("+7 900 123-45-678")).toBe("+7 900 123-45-67");
  });

  it("возвращает пустую строку, если цифр нет", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("abc")).toBe("");
  });

  it("идемпотентно", () => {
    for (const input of [
      "8 (900) 123-45-67",
      "9001234",
      "+375291234567",
      "8",
    ]) {
      const once = formatPhone(input);
      expect(formatPhone(once)).toBe(once);
    }
  });
});

describe("editPhone: набор", () => {
  it("растит номер по мере ввода", () => {
    const steps = [
      "+7",
      "+7 9",
      "+7 90",
      "+7 900",
      "+7 900 1",
      "+7 900 12",
      "+7 900 123",
      "+7 900 123-4",
      "+7 900 123-45",
      "+7 900 123-45-6",
      "+7 900 123-45-67",
    ];
    let state: PhoneEdit = { value: "", caret: 0 };
    for (const [index, char] of [..."79001234567"].entries()) {
      const raw = state.value + char;
      state = editPhone(raw, raw.length, state.value, "insertText");
      expect(state.value).toBe(steps[index]);
      expect(state.caret).toBe(state.value.length);
    }
  });

  it.each([
    ["8", "+7"],
    ["7", "+7"],
    ["9", "+7 9"],
  ])("первая цифра %s даёт %s", (first, expected) => {
    expect(typeInto(first).value).toBe(expected);
  });

  it("не даёт набрать больше 10 цифр после +7", () => {
    expect(typeInto("890012345678999").value).toBe("+7 900 123-45-67");
  });

  it("игнорирует буквы и сохраняет позицию курсора", () => {
    const edit = editPhone("+7 9x00 123", 5, "+7 900 123", "insertText");
    expect(edit).toEqual({ value: "+7 900 123", caret: 4 });
  });

  it("принимает международный номер после ручного «+»", () => {
    const plus = typeInto("+");
    expect(plus).toEqual({ value: "+", caret: 1 });
    expect(typeInto("375291234567", "+").value).toBe("+375 29 123 45 67");
  });

  it("сдвигает последнюю цифру при вставке в середину заполненного номера", () => {
    const edit = editPhone(
      "+7 9500 123-45-67",
      5,
      "+7 900 123-45-67",
      "insertText",
    );
    expect(edit.value).toBe("+7 950 012-34-56");
    expect(edit.caret).toBe(5);
  });
});

describe("editPhone: вставка", () => {
  it("нормализует вставленный номер в любом формате", () => {
    const pasted = "8 (900) 123-45-67";
    const edit = editPhone(pasted, pasted.length, "", "insertFromPaste");
    expect(edit).toEqual({ value: "+7 900 123-45-67", caret: 16 });
  });

  it("отбрасывает хвост вроде «доб. 12»", () => {
    const pasted = "+7 900 123-45-67 доб. 12";
    expect(editPhone(pasted, pasted.length, "", "insertFromPaste").value).toBe(
      "+7 900 123-45-67",
    );
  });
});

describe("editPhone: удаление", () => {
  const full = "+7 900 123-45-67";

  it("Backspace в конце стирает последнюю цифру", () => {
    const edit = editPhone(
      "+7 900 123-45-6",
      15,
      full,
      "deleteContentBackward",
    );
    expect(edit).toEqual({ value: "+7 900 123-45-6", caret: 15 });
  });

  it("Backspace по разделителю удаляет цифру перед ним, а не залипает", () => {
    // курсор после «123-», стёрт дефис
    const edit = editPhone(
      "+7 900 12345-67",
      10,
      full,
      "deleteContentBackward",
    );
    expect(edit.value).toBe("+7 900 124-56-7");
    expect(edit.caret).toBe(9);
  });

  it("Delete по разделителю удаляет цифру после него", () => {
    // курсор перед «-», стёрт дефис
    const edit = editPhone("+7 900 12345-67", 10, full, "deleteContentForward");
    expect(edit.value).toBe("+7 900 123-56-7");
    // курсор остаётся после седьмой цифры («3»)
    expect(edit.caret).toBe(10);
  });

  it("стирание кода страны очищает поле, а не оставляет «+»", () => {
    expect(editPhone("+", 1, "+7", "deleteContentBackward")).toEqual({
      value: "",
      caret: 0,
    });
  });

  it("выделение и удаление всего очищает поле", () => {
    expect(editPhone("", 0, full, "deleteContentBackward").value).toBe("");
  });
});

describe("caretAfterDigits", () => {
  it("ставит курсор после нужной цифры", () => {
    expect(caretAfterDigits("+7 900 123-45-67", 4)).toBe(6);
    expect(caretAfterDigits("+7 900 123-45-67", 11)).toBe(16);
  });

  it("не заходит левее «+» и не выходит за строку", () => {
    expect(caretAfterDigits("+7 900", 0)).toBe(1);
    expect(caretAfterDigits("+7 900", 99)).toBe(6);
    expect(caretAfterDigits("", 0)).toBe(0);
  });
});

describe("getPhoneIssue", () => {
  it.each(["", "   ", "+"])("пустое значение %j — не ошибка", (value) => {
    expect(getPhoneIssue(value)).toBeNull();
  });

  it.each([
    "+7 900 123-45-67",
    "89001234567",
    "8 (900) 123-45-67",
    "+375 29 123 45 67",
    // вымышленные номера учебных сценариев не должны считаться ошибкой
    "+7 000 000-00-00",
    "+7 900 000-00-01",
  ])("допускает %s", (value) => {
    expect(getPhoneIssue(value)).toBeNull();
  });

  it("считает недостающие цифры российского номера", () => {
    expect(getPhoneIssue("+7 900 123-45")).toEqual({
      code: "incomplete",
      message: "Неполный номер: не хватает 2 цифр",
    });
    expect(getPhoneIssue("+7 900 123-45-6")?.message).toBe(
      "Неполный номер: не хватает 1 цифры",
    );
    expect(getPhoneIssue("+7")?.message).toBe(
      "Неполный номер: не хватает 10 цифр",
    );
  });

  it("не считает цифры у номеров других стран", () => {
    expect(getPhoneIssue("+375 29 123")).toEqual({
      code: "incomplete",
      message: "Неполный номер",
    });
  });

  it("ловит слишком длинный и неизвестный код страны", () => {
    expect(getPhoneIssue("+7 900 123-45-678")?.code).toBe("invalid-length");
    expect(getPhoneIssue("+99999")?.code).toBe("unknown-country");
  });

  it("проверяет значения, пришедшие с сервера в произвольном виде", () => {
    expect(getPhoneIssue("123-45-67")?.code).toBe("incomplete");
  });
});
