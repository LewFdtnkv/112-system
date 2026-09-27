import {
  emptyCardFields,
  type IncidentCardFields,
} from "@/entities/incident-card";

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === "string");
const feature = (v: unknown) =>
  typeof v === "string" || typeof v === "boolean" || strings(v);

/** Storage is untrusted input, just like a response from an older client. */
export function validDraftFields(value: unknown): value is IncidentCardFields {
  if (!object(value)) return false;
  for (const [key, sample] of Object.entries(emptyCardFields)) {
    if (typeof sample === "string" && typeof value[key] !== "string")
      return false;
  }
  for (const key of ["address", "phones"] as const) {
    const fields = value[key];
    if (
      !object(fields) ||
      Object.values(fields).some((v) => typeof v !== "string")
    )
      return false;
    if (
      Object.keys(emptyCardFields[key]).some(
        (k) => typeof fields[k] !== "string",
      )
    )
      return false;
  }
  return (
    (value.details == null ||
      (object(value.details) &&
        Object.entries(value.details).every(([key, v]) =>
          key === "clarifications"
            ? object(v) && Object.values(v).every(strings)
            : typeof v === "string" || typeof v === "boolean",
        ))) &&
    (value.victimsCount === null ||
      (typeof value.victimsCount === "number" &&
        Number.isFinite(value.victimsCount))) &&
    strings(value.services) &&
    (value.manualServices == null ||
      (Array.isArray(value.manualServices) &&
        value.manualServices.every(
          (v) =>
            object(v) && typeof v.id === "string" && typeof v.name === "string",
        ))) &&
    (value.ekpAnswers == null ||
      (object(value.ekpAnswers) &&
        Object.values(value.ekpAnswers).every(feature))) &&
    (value.location == null ||
      (object(value.location) &&
        Number.isFinite(value.location.latitude) &&
        Number.isFinite(value.location.longitude)))
  );
}
