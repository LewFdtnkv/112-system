import { cardFlagFields, emptyIncidentAddress } from "@/entities/incident-card";
import type { FeatureDefinition } from "@/entities/training";
import type { FeatureValue } from "@/shared/lib/featureValues";
import type { MapPoint } from "@/shared/lib/geo";
import type { CardEditorProps } from "../types/CardEditor";
import type { CardEditorState } from "../types/cardEditorState";
const mapPoint = (value: unknown): MapPoint | null => {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isFinite((value as MapPoint).latitude) ||
    !Number.isFinite((value as MapPoint).longitude)
  )
    return null;
  return value as MapPoint;
};

export function cardEditorInitial(
  initial: CardEditorProps["initial"],
): CardEditorState {
  return {
    ddsExercise: initial?.dds_exercise ?? null,
    location: mapPoint(initial?.data.additional_fields?.location),
    address: {
      ...emptyIncidentAddress,
      ...Object.fromEntries(
        Object.entries(initial?.data.address_details ?? {}).filter(
          ([, v]) => typeof v === "string",
        ),
      ),
    },
    person: {
      gender: String(initial?.data.caller_details?.gender ?? ""),
      age: String(initial?.data.caller_details?.age ?? ""),
      height_cm: String(initial?.data.caller_details?.height_cm ?? ""),
      weight_kg: String(initial?.data.caller_details?.weight_kg ?? ""),
      appearance: String(initial?.data.caller_details?.appearance ?? ""),
    },
    victims: String(initial?.data.features?.victimsCount ?? ""),
    flags: (() => {
      const details = initial?.data.additional_fields?.details as
        Record<string, unknown> | undefined;
      return Object.fromEntries(
        cardFlagFields.map(({ key }) => [
          key,
          typeof details?.[key] === "boolean"
            ? details[key]
            : initial
              ? undefined
              : false,
        ]),
      );
    })(),
    version: initial
      ? { id: initial.classifier_version_id, label: initial.classifier_label }
      : null,
    entry: initial?.classifier_entry
      ? {
          id: initial.classifier_entry.id,
          label: `${initial.classifier_entry.code} — ${initial.classifier_entry.name}`,
        }
      : null,
    notificationRequired:
      initial?.classifier_entry?.notification_required !== false,
    features: (initial?.classifier_entry?.conditions.features ??
      []) as FeatureDefinition[],
    answers: (initial?.data.features?.ekp ?? {}) as Record<
      string,
      FeatureValue
    >,
    manualRecipients: initial
      ? (initial.recipients ?? []).map((s) => ({
          id: s.service_id,
          label: s.name,
        }))
      : null,
    optional: [],
    form: {
      title: initial?.title ?? "",
      caller_message: initial?.caller_message ?? "",
      instructions: initial?.instructions ?? "",
      address_text: initial?.data.address_text ?? "",
      description: initial?.data.description ?? "",
      caller_name: initial?.data.caller_name ?? "",
      caller_phone: initial?.data.caller_phone ?? "",
    },
  };
}
