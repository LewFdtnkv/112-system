import type { ClientObservation } from "@/entities/training";

export interface ObservationPersistence {
  load: () => ClientObservation[];
  save: (events: ClientObservation[]) => void;
}
