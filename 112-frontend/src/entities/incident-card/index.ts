export {
  cardDraftStorageKey,
  clearCardDraft,
  readCardDraft,
  writeCardDraft,
} from "./model/cardDraft";
export type { CardDraft } from "./model/cardDraft";
export { demoIncidents } from "./model/demoIncidents";
export {
  countFilledFields,
  emptyCardFields,
  emptyIncidentAddress,
  emptyIncidentPhones,
  formatAddress,
  frequentIncidentCategoryIds,
  getCategoryName,
  getIncidentTagGroups,
  getMissingCardFields,
  incidentCategories,
  incidentStatusLabels,
  incidentStatuses,
  requiredCardFields,
  responseServices,
  totalCardFields,
} from "./model/types";
export type {
  IncidentAddress,
  IncidentCard,
  IncidentCardDetails,
  IncidentCardFields,
  IncidentCategory,
  IncidentPhones,
  IncidentStatus,
  IncidentTagGroup,
  ResponseService,
} from "./model/types";

export { incidentCardFieldLabels } from "./model/fieldLabels";
