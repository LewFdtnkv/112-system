import type { ScenarioDetail } from "@/entities/training";
import type {
  ScenarioEditorState,
  ScenarioEditorAction,
} from "../types/ScenarioEditorPage";

export function arrivalOffsets(rows: ScenarioEditorState["rows"]) {
  const offsets: number[] = [];
  for (const row of rows) offsets.push((offsets.at(-1) ?? 0) + row.delay);
  return offsets;
}

export function scenarioEditorInitial(
  initial?: ScenarioDetail,
): ScenarioEditorState {
  return {
    form: {
      title: initial?.title ?? "",
      assessment_policy: initial?.assessment_policy ?? {
        version: "weighted-fields-v1",
        weights: {
          classification: 25,
          notification: 25,
          address: 30,
          caller: 10,
          victims: 10,
        },
      },
      category: initial?.category ?? "",
      difficulty: initial?.difficulty ?? "basic",
      duration_minutes: initial?.duration_minutes ?? 15,
      norm_seconds: initial?.norm_seconds ?? 30,
      instructions: initial?.instructions ?? "",
      status: initial?.status ?? "draft",
      role: initial?.role ?? "operator_112",
      card_ids: [],
      service_profile_id: initial?.service_profile_id ?? null,
      dds_policy: null,
    },
    profile: initial?.service_profile_id
      ? { id: initial.service_profile_id, label: "Назначенный профиль ДДС" }
      : null,
    rows:
      initial?.cards.map((card, index, cards) => ({
        card: { id: card.card_template_id, label: card.snapshot.title },
        delay:
          index === 0
            ? 0
            : (card.arrival_offset_seconds ?? index * 60) -
              (cards[index - 1].arrival_offset_seconds ?? (index - 1) * 60),
      })) ?? [],
  };
}

export function scenarioEditorReducer(
  state: ScenarioEditorState,
  action: ScenarioEditorAction,
): ScenarioEditorState {
  switch (action.type) {
    case "form":
      return { ...state, form: action.value };
    case "profile":
      return {
        ...state,
        profile: action.value,
        form: { ...state.form, dds_policy: null },
      };
    case "add":
      return state.rows.length < 100
        ? {
            ...state,
            rows: [
              ...state.rows,
              { card: action.card, delay: state.rows.length ? 60 : 0 },
            ],
          }
        : state;
    case "remove":
      return {
        ...state,
        rows: state.rows
          .filter((_, i) => i !== action.index)
          .map((row, i) => (i ? row : { ...row, delay: 0 })),
      };
    case "delay":
      return {
        ...state,
        rows: state.rows.map((row, i) =>
          i === action.index ? { ...row, delay: action.value } : row,
        ),
      };
    case "move": {
      const other = action.index + action.step;
      if (!state.rows[action.index] || !state.rows[other]) return state;
      // Arrival intervals belong to positions, not cards: preserve existing scheduling behavior.
      return {
        ...state,
        rows: state.rows.map((row, i) => ({
          ...row,
          card: state.rows[
            i === action.index ? other : i === other ? action.index : i
          ].card,
        })),
      };
    }
  }
}
