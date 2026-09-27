import type { ErrorAnalytics, ErrorCard } from "@/entities/training";

export interface ErrorAnalyticsProps {
  track: string;
}

export interface ErrorCardRowProps {
  card: ErrorCard;
  skills: ErrorAnalytics["skills"];
}
