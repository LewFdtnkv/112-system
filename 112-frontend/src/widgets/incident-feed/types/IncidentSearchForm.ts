import type { IncidentFeedFilters } from "./IncidentFeedFilters";
export interface IncidentSearchFormProps {
  filters: IncidentFeedFilters;
  advanced: boolean;
  onFiltersChange: (filters: IncidentFeedFilters) => void;
  onSubmit: () => void;
  onReset: () => void;
  onAdvancedToggle: () => void;
}
