import { type ResponseService } from "@/entities/incident-card";
import type { RemoteEditor } from "@/features/incident-editing";
export interface Props {
  open: boolean;
  selected: readonly ResponseService[];
  onToggle: (
    service: ResponseService,
    name?: string,
    short_name?: string | null,
  ) => void;
  remote?: RemoteEditor;
  manual?: boolean;
  onReset?: () => void;
  onClose: () => void;
}
