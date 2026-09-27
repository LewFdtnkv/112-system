import type { CardData } from "@/entities/training";
import type { ClassifierEntry, Recipient } from "@/entities/catalog";
export interface ReferenceCardSource {
  id: string;
  display_number?: number;
  title: string;
  data: CardData;
  classifier_entry?: ClassifierEntry | null;
  recipients?: Recipient[];
}
