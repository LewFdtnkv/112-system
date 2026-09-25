import type { AIJobItem, AIJobFilters, AIJobSummary } from "@/entities/ai-job";
export interface JobFiltersProps {
  filters: AIJobFilters;
  update: (key: string, value: string) => void;
}
export interface JobTableProps {
  items: AIJobItem[];
  onSelect: (id: string) => void;
}
export interface JobStatsProps {
  summary: AIJobSummary;
}
export interface JobDetailProps {
  id: string;
  onClose: () => void;
}
