import type {
  AIJobItem,
  AIJobFilters,
  AIJobSummary,
  AIJobDetail,
} from "@/entities/ai-job";
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

export interface JobDiagnosticsProps {
  job: AIJobDetail;
}

export interface JobJsonProps {
  value: unknown;
}
