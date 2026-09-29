import { emptyIncidentAddress } from "@/entities/incident-card";
import { updateFeatureAnswer } from "@/shared/lib/featureValues";
import type { FeatureDefinition } from "@/entities/training";
import type {
  CardEditorState,
  CardEditorAction,
} from "../types/cardEditorState";

export function cardEditorReducer(
  state: CardEditorState,
  action: CardEditorAction,
): CardEditorState {
  switch (action.type) {
    case "version":
      return {
        ...state,
        version: action.value,
        entry: null,
        features: [],
        notificationRequired: true,
        answers: {},
        optional: [],
        manualRecipients: null,
      };
    case "entry": {
      const metadata = action.value?.metadata as
        | {
            features?: FeatureDefinition[];
            notification_required?: boolean;
          }
        | undefined;
      return {
        ...state,
        entry: action.value,
        features: metadata?.features ?? [],
        notificationRequired: metadata?.notification_required !== false,
        answers: {},
        optional: [],
        manualRecipients: null,
      };
    }
    case "answer":
      return {
        ...state,
        answers: updateFeatureAnswer(
          state.features,
          state.answers,
          action.key,
          action.value,
        ),
      };
    case "victims":
      return {
        ...state,
        victims: action.value,
        flags:
          action.value === ""
            ? state.flags
            : { ...state.flags, hasVictims: Number(action.value) > 0 },
      };
    case "flag": {
      const silent = action.key === "noContact" && action.value;
      const conflict =
        action.key === "hasVictims" &&
        action.value != null &&
        state.victims !== "" &&
        Number(state.victims) > 0 !== action.value;
      return {
        ...state,
        victims: silent || conflict ? "" : state.victims,
        flags: {
          ...state.flags,
          [action.key]: action.value,
          ...(silent
            ? {
                hasVictims: undefined,
                refusedAmbulance: undefined,
                blocked: undefined,
              }
            : {}),
        },
      };
    }
    case "form":
      return { ...state, form: { ...state.form, ...action.value } };
    case "location": {
      const { point, address } = action.value;
      if (!address) return { ...state, location: point };
      return {
        ...state,
        location: point,
        form: { ...state.form, address_text: address.addressLine },
        address: {
          ...emptyIncidentAddress,
          country: address.country || "Россия",
          region: address.administrativeAreas[0] ?? "",
          locality: address.localities.at(-1) ?? "",
          district: address.district,
          area: address.area,
          street: address.street,
          house: address.house,
          building: address.building,
          structure: address.structure,
          apartment: address.apartment,
          description: address.addressLine,
        },
      };
    }
    default:
      return { ...state, [action.type]: action.value };
  }
}
