export interface DDSReactionClockProps {
  label?: string;
  elapsed: number;
  norm: number | null | undefined;
  responded: boolean;
  completed: boolean;
}

export interface DDSTimingClocksProps {
  attempt: import("@/entities/training").Attempt;
  now: number;
}
