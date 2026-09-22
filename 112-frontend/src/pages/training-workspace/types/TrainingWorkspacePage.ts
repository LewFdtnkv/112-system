import { type Attempt, type StudentLesson } from "@/entities/training";
export type WorkspaceProps = { lesson: StudentLesson };

export type AttemptEditorProps = {
  initial: Attempt;
  onClose: () => void;
  onSaved: () => void;
};
