import type { IncidentCardEditor } from "./IncidentCardDialog";
export interface CardServiceTilesProps {
  editor: IncidentCardEditor;
  submitted: boolean;
  viewing: boolean;
  activeService?: string;
  onActiveServiceChange: (id?: string) => void;
  servicesOpen: boolean;
  onServicesToggle: () => void;
  locked: (skill: string) => boolean;
}
