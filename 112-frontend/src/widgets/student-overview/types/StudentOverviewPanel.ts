import { type StudentOverview } from "@/entities/training";
export type PerformanceRingProps = {
  value: number | null;
  title: string;
  description: string;
};

export type StudentOverviewPanelProps = {
  data: StudentOverview;
  own?: boolean;
  onActivePage: (page: number) => void;
};
