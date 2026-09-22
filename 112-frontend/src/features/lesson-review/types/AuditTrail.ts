import { type AuditEvent } from "@/entities/training";
export type EventDetailsProps = { event: AuditEvent };

export type AuditTrailProps = {
  lessonId: string;
  studentId: string;
  attemptId: string;
};
