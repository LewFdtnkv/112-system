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

export type StudentIdentityProps = {
  user: StudentOverview["user"];
  groups: string[];
};
export type StudentActiveLessonsProps = {
  data: StudentOverview;
  own: boolean;
  onPage: (page: number) => void;
};
export type StudentPerformanceProps = { data: StudentOverview; own: boolean };
