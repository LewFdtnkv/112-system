import { expect, it } from "vitest";
import { cardEditorInitial } from "./cardEditorInitial";
import { cardEditorReducer } from "./cardEditorReducer";

it("resets dependent routing fields together without discarding the condition", () => {
  const initial = {
    ...cardEditorInitial(undefined),
    form: { ...cardEditorInitial(undefined).form, caller_message: "Помогите" },
    answers: { detail: "answer" },
    optional: ["service"],
    manualRecipients: [{ id: "service", label: "Служба" }],
  };
  const next = cardEditorReducer(initial, {
    type: "entry",
    value: {
      id: "entry",
      label: "Консультация",
      metadata: { notification_required: false, features: [] },
    },
  });
  expect(next).toMatchObject({
    answers: {},
    optional: [],
    manualRecipients: null,
    notificationRequired: false,
  });
  expect(next.form.caller_message).toBe("Помогите");
  const changedVersion = cardEditorReducer(next, {
    type: "version",
    value: { id: "v2", label: "ЕКП" },
  });
  expect(changedVersion.entry).toBeNull();
  expect(changedVersion.notificationRequired).toBe(true);
  expect(initial.answers).toEqual({ detail: "answer" });
});

it("keeps victim counts consistent with flags and silent calls", () => {
  const victims = cardEditorReducer(cardEditorInitial(undefined), {
    type: "victims",
    value: "4",
  });
  expect(victims.flags.hasVictims).toBe(true);
  expect(
    cardEditorReducer(victims, {
      type: "flag",
      key: "hasVictims",
      value: false,
    }).victims,
  ).toBe("");
  expect(
    cardEditorReducer(victims, { type: "flag", key: "noContact", value: true }),
  ).toMatchObject({
    victims: "",
    flags: {
      noContact: true,
      hasVictims: undefined,
      blocked: undefined,
      refusedAmbulance: undefined,
    },
  });
  expect(
    cardEditorReducer(victims, { type: "victims", value: "" }).flags.hasVictims,
  ).toBe(true);
});
