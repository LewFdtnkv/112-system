import type { CardListItem, GenerationJob } from "@/entities/training";

export interface CardLibraryTableProps {
  cards: CardListItem[];
  generationJobs: GenerationJob[];
  onEdit: (id: string) => void;
  onOpen: (id: string) => void;
}

export interface CardLibraryRowProps {
  card: CardListItem;
  onEdit: (id: string) => void;
  onOpen: (id: string) => void;
}
