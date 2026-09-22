import { type AutomaticCheck, type WorkReview } from "@/entities/training";
export type ReviewedCard = WorkReview["assignments"][number];

export type ComparisonField = Omit<
  AutomaticCheck["fields"][number],
  "status"
> & {
  status: AutomaticCheck["fields"][number]["status"] | "unscored";
  group: string;
};
