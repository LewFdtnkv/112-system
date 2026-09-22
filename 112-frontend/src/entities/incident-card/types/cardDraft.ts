import { type IncidentCardFields } from "../model/types";
export interface CardDraft {
  cardId: string;
  fields: IncidentCardFields;
  savedAt: string;
}
