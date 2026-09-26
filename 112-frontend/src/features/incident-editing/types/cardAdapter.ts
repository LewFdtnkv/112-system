import type { CardData, ClassifierEntry, Recipient } from "@/entities/training";
export interface ReferenceCardSource {
  id: string;
  display_number?: number;
  title: string;
  data: CardData;
  classifier_entry?: ClassifierEntry | null;
  recipients?: Recipient[];
}
