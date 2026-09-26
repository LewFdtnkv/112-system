import { defaultLearningPolicy } from "@/entities/training";
import type { Attempt } from "@/entities/training";
export const initialAttempt: Attempt = {
  learning: defaultLearningPolicy(),
  id: "attempt",
  assignment_id: "assignment",
  status: "in_progress",
  started_at: "2026-09-19T10:00:00Z",
  ended_at: null,
  instructions: "Заполните карточку",
  caller_message: "На Учебной улице дым",
  time_limit_seconds: null,
  norm_seconds: 60,
  card: {
    id: "card",
    display_number: 1042,
    revision: 3,
    classifier_version_id: "version",
    classifier_entry_id: null,
    status: "draft",
    data: {
      description: "Серверный черновик",
      address_text: "Учебная улица, 7",
      additional_fields: {},
    },
    opened_at: null,
    saved_at: null,
  },
  classifier_entry: null,
  notified_services: [],
  recipient_services: [],
  recipient_error: null,
};
