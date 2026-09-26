import type { CardTemplatePayloadBuilder } from "../types/CardEditorPanels";

/** Converts editor state into the API contract without React dependencies. */
export const buildCardTemplateInput: CardTemplatePayloadBuilder = ({
  initial,
  form,
  version,
  entry,
  silent,
  manualRecipients,
  recipients,
  structuredAddress,
  address,
  victims,
  answers,
  person,
  flags,
  location,
}) => ({
  title: form.title,
  caller_message: form.caller_message.trim() ? form.caller_message : null,
  instructions: form.instructions,
  classifier_version_id: version!.id,
  classifier_entry_id: silent ? null : entry!.id,
  recipient_service_ids: silent
    ? []
    : (manualRecipients?.map((service) => service.id) ?? recipients),
  use_recommended_recipients: manualRecipients === null,
  data: {
    ...initial?.data,
    address_text: silent ? "" : structuredAddress || form.address_text,
    address_details: silent
      ? null
      : Object.fromEntries(
          Object.entries(address).filter(([, value]) => value?.trim()),
        ),
    features: {
      ...initial?.data.features,
      victimsCount: silent || victims === "" ? null : Number(victims),
      ekp: silent ? {} : answers,
    },
    description: form.description,
    caller_details: silent
      ? null
      : {
          ...initial?.data.caller_details,
          ...Object.fromEntries(
            Object.entries(person).map(([key, value]) => [
              key,
              value === ""
                ? null
                : ["age", "height_cm", "weight_kg"].includes(key)
                  ? Number(value)
                  : value,
            ]),
          ),
        },
    caller_name: silent ? null : form.caller_name,
    caller_phone: form.caller_phone.trim() === "+" ? "" : form.caller_phone,
    additional_fields: {
      ...initial?.data.additional_fields,
      location: silent ? null : location,
      details: {
        ...((initial?.data.additional_fields?.details as Record<
          string,
          unknown
        >) ?? {}),
        ...flags,
        ...(silent
          ? { callerGender: null, callerAge: null, callerStatus: null }
          : {
              callerGender: person.gender || null,
              callerAge: person.age || null,
            }),
      },
    },
  },
});
