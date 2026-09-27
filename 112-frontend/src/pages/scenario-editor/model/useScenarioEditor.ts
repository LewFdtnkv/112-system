import { useReducer } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { scenarioApi, type ScenarioInput } from "@/entities/training";
import { routePaths } from "@/shared/config/routes";
import type { SelectOption } from "@/shared/ui/ServerSelect";
import type { EditorProps } from "../types/ScenarioEditorPage";
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
  const { form, profile, rows, choice } = state;
  const schedule = {
    cards: rows.map((row) => row.card),
    delays: rows.map((row) => row.delay),
    choice,
    offsets: arrivalOffsets(rows),
    setChoice: (value: SelectOption | null) =>
      dispatch({ type: "choice", value }),
    add: () => dispatch({ type: "add" }),
    remove: (index: number) => dispatch({ type: "remove", index }),
    move: (index: number, step: number) =>
      dispatch({ type: "move", index, step }),
    changeDelay: (index: number, value: number) =>
      dispatch({ type: "delay", index, value }),
  };
  const save = useMutation({
    mutationFn: () =>
      scenarioApi.save(
        {
          ...form,
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
      ),
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
    setForm: (value: ScenarioInput) => dispatch({ type: "form", value }),
    setProfile: (value: SelectOption | null) =>
      dispatch({ type: "profile", value }),
    validate: () => {
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
