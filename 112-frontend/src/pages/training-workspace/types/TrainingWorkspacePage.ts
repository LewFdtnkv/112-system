import { type Attempt, type StudentLesson } from "@/entities/training";
export type WorkspaceProps = { lesson: StudentLesson };
export interface OpenAttempt {
  assignmentId: string;
  attemptId: string | null;
}

export type AttemptEditorProps = {
  initial: Attempt;
  onClose: () => void;
  onSaved: () => void;
};
