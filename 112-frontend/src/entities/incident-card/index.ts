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
  getCategoryName,
  getIncidentTagGroups,
  getMissingCardFields,
  incidentCategories,
  frequentIncidentCategoryIds,
  incidentStatusLabels,
  incidentStatuses,
  requiredCardFields,
  responseServices,
  totalCardFields,
} from "./model/types";
export type {
  IncidentAddress,
  IncidentCard,
  IncidentCardFields,
  IncidentCardDetails,
  IncidentCategory,
  IncidentPhones,
  IncidentTagGroup,
  IncidentStatus,
  ResponseService,
} from "./model/types";
