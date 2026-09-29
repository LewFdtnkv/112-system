import { useReducer, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { scenarioApi } from "@/entities/training";
import { routePaths } from "@/shared/config/routes";
import type { SelectOption } from "@/shared/ui/ServerSelect";
import type {
  EditorProps,
  ScenarioEditorForm,
  ScenarioEditorAction,
} from "../types/ScenarioEditorPage";
import {
  arrivalOffsets,
  scenarioEditorInitial,
  scenarioEditorReducer,
} from "./scenarioEditorState";

export function useScenarioEditor({ initial }: EditorProps) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [state, dispatch] = useReducer(
    scenarioEditorReducer,
    initial,
    scenarioEditorInitial,
  );
  const { form, profile, rows } = state;
  const [selectionChange, setSelectionChange] =
    useState<ScenarioEditorAction | null>(null);
  const changeSelection = (action: ScenarioEditorAction, changed: boolean) => {
    if (changed && rows.length) setSelectionChange(action);
    else dispatch(action);
  };
  const schedule = {
    cards: rows.map((row) => row.card),
    delays: rows.map((row) => row.delay),
    offsets: arrivalOffsets(rows),
    add: (card: SelectOption) => dispatch({ type: "add", card }),
    remove: (index: number) => dispatch({ type: "remove", index }),
    move: (index: number, step: number) =>
      dispatch({ type: "move", index, step }),
    changeDelay: (index: number, value: number) =>
      dispatch({ type: "delay", index, value }),
  };
  const save = useMutation({
    mutationFn: () => {
      if (!form.role || (form.role === "dds" && !profile))
        throw new Error("Выберите учебную роль и профиль службы для ДДС.");
      return scenarioApi.save(
        {
          ...form,
          role: form.role,
          card_ids: schedule.cards.map((card) => card.id),
          arrival_offsets_seconds:
            form.role === "dds"
              ? schedule.offsets
              : schedule.cards.map(() => 0),
          dds_policy: null,
          service_profile_id:
            form.role === "dds" ? (profile?.id ?? null) : null,
        },
        initial?.id,
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["scenarios"] });
      void client.invalidateQueries({ queryKey: ["scenario-options"] });
      navigate(routePaths.scenarios);
    },
  });

  return {
    form,
    profile,
    schedule,
    save,
    selectionChange,
    confirmSelectionChange: () => {
      if (selectionChange) dispatch(selectionChange);
      setSelectionChange(null);
    },
    cancelSelectionChange: () => setSelectionChange(null),
    setForm: (value: ScenarioEditorForm) =>
      changeSelection({ type: "form", value }, value.role !== form.role),
    setProfile: (value: SelectOption | null) =>
      changeSelection({ type: "profile", value }, value?.id !== profile?.id),
    validate: () => {
      if (!form.role)
        return [{ path: "role", message: "Выберите учебную роль." }];
      if (form.role === "dds" && !profile)
        return [
          { path: "service_profile_id", message: "Выберите профиль службы." },
        ];
      const index =
        form.role === "dds"
          ? schedule.offsets.findIndex(
              (offset) => offset >= form.duration_minutes! * 60,
            )
          : -1;
      return index < 0
        ? []
        : [
            {
              path: `arrival_offsets_seconds.${index}`,
              message: `Карточка ${index + 1} поступает после завершения сценария или одновременно с ним. Уменьшите интервал или увеличьте длительность сценария.`,
            },
          ];
    },
    submit: () => {
      if (!form.role || (form.role === "dds" && !profile)) return;
      if (
        !initial ||
        window.confirm(
          "Сохранить новую версию сценария? Назначенные задания сохранят прежнюю версию.",
        )
      )
        save.mutate();
    },
  };
}
