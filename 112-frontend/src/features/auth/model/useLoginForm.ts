import type { KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import type { LoginValues } from "../types/LoginForm";

export function useLoginForm() {
  const form = useForm<LoginValues>({
    defaultValues: { username: "", password: "" },
  });
  const { ref: usernameRef, ...username } = form.register("username", {
    required: "Укажите логин.",
    pattern: {
      value: /^[A-Za-z0-9_.-]{1,50}$/,
      message:
        "Используйте латинские буквы, цифры, точку, дефис или подчёркивание.",
    },
  });
  const { ref: passwordRef, ...password } = form.register("password", {
    required: "Укажите пароль.",
  });
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.defaultPrevented ||
      !(event.target instanceof HTMLInputElement)
    )
      return;
    event.preventDefault();
    if (!form.formState.isSubmitting && !event.repeat)
      event.currentTarget.requestSubmit();
  };
  return { ...form, onKeyDown, username, usernameRef, password, passwordRef };
}
