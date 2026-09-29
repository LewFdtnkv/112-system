import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import ky from "ky";
import { ValidatedForm } from "./ValidatedForm";
import { ValidationField } from "./ValidationField";
import { ValidatedTextField } from "./ValidatedTextField";
import { FeatureInput } from "../../FeatureInput";
import { getApiFieldErrors } from "@/shared/api";

afterEach(cleanup);

it("preserves sibling errors inside a group when typing or choosing an option", async () => {
  function Form() {
    const [answer, setAnswer] = useState<boolean>();
    return (
      <ValidatedForm onSubmit={() => {}}>
        <ValidationField
          name="data.features.ekp"
          label="Признаки"
          validate={() => "Проверьте признаки."}
        >
          <ValidatedTextField
            name="data.features.ekp.first"
            label="Первый"
            required
          />
          <ValidatedTextField
            name="data.features.ekp.second"
            label="Второй"
            required
          />
          <FeatureInput
            feature={{ key: "flag", label: "Флаг", type: "boolean" }}
            value={answer}
            onChange={(v) => setAnswer(v as boolean)}
          />
        </ValidationField>
        <button type="submit">Сохранить</button>
      </ValidatedForm>
    );
  }
  render(<Form />);
  await act(async () => fireEvent.click(screen.getByText("Сохранить")));
  const first = screen.getByLabelText("Первый", { exact: false });
  const second = screen.getByLabelText("Второй", { exact: false });
  expect(screen.getByRole("alert").textContent).toContain(
    "Проверьте признаки.",
  );
  expect(first.getAttribute("aria-invalid")).toBe("true");
  expect(second.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(first, { target: { value: "Ответ" } });
  expect(first.getAttribute("aria-invalid")).toBe("false");
  expect(second.getAttribute("aria-invalid")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Флаг: Нет" }));
  expect(second.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toContain("Второй");
});

it("blocks blank and malformed values, focuses the first field and clears only the edited error", async () => {
  const submit = vi.fn();
  render(
    <ValidatedForm onSubmit={submit}>
      <ValidatedTextField
        name="name"
        label="Название"
        required
        defaultValue="   "
      />
      <ValidatedTextField
        name="count"
        label="Количество"
        type="number"
        defaultValue="1.5"
        slotProps={{ htmlInput: { min: 1, max: 10 } }}
      />
      <button type="submit">Сохранить</button>
    </ValidatedForm>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).not.toHaveBeenCalled();
  const name = screen.getByLabelText("Название", { exact: false });
  expect(document.activeElement).toBe(name);
  expect(name.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(name, { target: { value: "Группа" } });
  expect(name.getAttribute("aria-invalid")).toBe("false");
  expect(screen.getByLabelText("Количество").getAttribute("aria-invalid")).toBe(
    "true",
  );
  fireEvent.change(screen.getByLabelText("Количество"), {
    target: { value: "2" },
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).toHaveBeenCalledOnce();
});

it("validates password length including programmatic input and ignores disabled fields", async () => {
  const submit = vi.fn();
  render(
    <ValidatedForm onSubmit={submit}>
      <ValidatedTextField
        name="password"
        label="Пароль"
        required
        defaultValue="short"
        slotProps={{ htmlInput: { minLength: 12 } }}
      />
      <ValidatedTextField label="Отключённое" disabled required />
      <button type="submit">Сохранить</button>
    </ValidatedForm>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("не менее 12");
  expect(screen.getByRole("alert").textContent).not.toContain("Отключённое");
});

it("accepts false for required boolean and removes rules when conditional field disappears", async () => {
  const submit = vi.fn();
  function Form() {
    const [value, setValue] = useState<boolean>();
    const [visible, setVisible] = useState(true);
    return (
      <ValidatedForm onSubmit={submit}>
        <FeatureInput
          feature={{ key: "victims", label: "Пострадавшие", type: "boolean" }}
          value={value}
          onChange={(v) => setValue(v as boolean)}
        />
        {visible && (
          <FeatureInput
            value={undefined}
            feature={{ key: "detail", label: "Уточнение", type: "text" }}
            onChange={() => {}}
          />
        )}
        <button type="button" onClick={() => setVisible(false)}>
          Скрыть
        </button>
        <button type="submit">Сохранить</button>
      </ValidatedForm>
    );
  }
  render(<Form />);
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Пострадавшие: Нет" }));
  fireEvent.click(screen.getByText("Скрыть"));
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).toHaveBeenCalledOnce();
});

it("maps nested API locations, focuses and clears the server error on editing", async () => {
  const error = await ky
    .post("https://test.invalid", {
      retry: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({
            detail: [
              null,
              {
                loc: ["body", "data", "description"],
                type: "string_too_short",
                msg: "secret input",
              },
            ],
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    })
    .catch((e: unknown) => e);
  expect(getApiFieldErrors(error)).toEqual([
    {
      path: "data.description",
      message: "Значение слишком короткое. Дополните поле.",
    },
  ]);
  render(
    <ValidatedForm error={error} onSubmit={() => {}}>
      <ValidatedTextField name="data.description" label="Описание" />
    </ValidatedForm>,
  );
  const input = screen.getByLabelText("Описание");
  expect(document.activeElement).toBe(input);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.queryByText("secret input")).toBeNull();
  fireEvent.change(input, { target: { value: "Исправление" } });
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("opens a collapsed section containing the first error", async () => {
  const submit = vi.fn();
  render(
    <ValidatedForm onSubmit={submit}>
      <details>
        <summary>Дополнительно</summary>
        <ValidatedTextField label="Вес" name="weight" required />
      </details>
      <button type="submit">Сохранить</button>
    </ValidatedForm>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).not.toHaveBeenCalled();
  expect(
    screen.getByText("Дополнительно").parentElement?.hasAttribute("open"),
  ).toBe(true);
  expect(document.activeElement).toBe(
    screen.getByLabelText("Вес", { exact: false }),
  );
});

it("keeps a safe card constraint explanation and focuses its field", async () => {
  const message =
    "Службы выбранного профиля ДДС нет среди получателей карточки.";
  const error = await ky
    .post("https://test.invalid", {
      retry: 0,
      fetch: async () =>
        new Response(
          JSON.stringify({
            detail: [
              {
                loc: ["body", "dds_exercise", "service_profile_id"],
                type: "card_constraint",
                msg: message,
              },
            ],
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    })
    .catch((e: unknown) => e);
  render(
    <ValidatedForm error={error} onSubmit={() => {}}>
      <ValidatedTextField
        name="dds_exercise.service_profile_id"
        label="Профиль ДДС"
      />
    </ValidatedForm>,
  );
  expect(screen.getByRole("alert").textContent).toContain(message);
  expect(document.activeElement).toBe(screen.getByLabelText("Профиль ДДС"));
});

it("removes errors for an unmounted native field without another save", async () => {
  function Form() {
    const [visible, show] = useState(true);
    return (
      <ValidatedForm onSubmit={() => {}}>
        {visible && (
          <ValidatedTextField
            name="conditional"
            label="Условное поле"
            required
          />
        )}
        <button type="button" onClick={() => show(false)}>
          Удалить поле
        </button>
        <button type="submit">Сохранить</button>
      </ValidatedForm>
    );
  }
  render(<Form />);
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByText("Удалить поле"));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("keeps the error when a user only clicks an explanation in its group", async () => {
  render(
    <ValidatedForm onSubmit={() => {}}>
      <ValidationField
        name="choice"
        label="Выбор"
        validate={() => "Выберите вариант."}
      >
        <p>Пояснение к выбору</p>
        <button type="button" aria-pressed={false}>
          Вариант
        </button>
      </ValidationField>
      <button type="submit">Сохранить</button>
    </ValidatedForm>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  fireEvent.click(screen.getByText("Пояснение к выбору"));
  expect(screen.getByRole("alert").textContent).toContain("Выберите вариант.");
  fireEvent.click(screen.getByText("Вариант"));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("revalidates on retry even if the previous API error has no mounted control", async () => {
  const submit = vi.fn();
  const error = await ky
    .post("https://test.invalid", {
      retry: 0,
      fetch: async () =>
        Response.json(
          {
            field_errors: [
              { path: "revision", message: "Обновите данные.", code: "stale" },
            ],
          },
          { status: 409 },
        ),
    })
    .catch((error: unknown) => error);
  render(
    <ValidatedForm error={error} onSubmit={submit}>
      <button type="submit">Сохранить</button>
    </ValidatedForm>,
  );
  expect(screen.getByRole("alert").textContent).toContain("Обновите данные.");
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).toHaveBeenCalledOnce();
});
