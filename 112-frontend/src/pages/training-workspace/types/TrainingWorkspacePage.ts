import { type Attempt, type StudentLesson } from "@/entities/training";
import type { useStudentWorkspace } from "../model/useStudentWorkspace";
export type WorkspaceProps = { lesson: StudentLesson };
export type StudentWorkspaceState = ReturnType<typeof useStudentWorkspace>;
export type WorkspaceStageProps = {
  lesson: StudentLesson;
  workspace: StudentWorkspaceState;
};
export interface OpenAttempt {
  assignmentId: string;
  attemptId: string | null;
}

export type AttemptEditorProps = {
  initial: Attempt;
  onClose: () => void;
  onSaved: () => void;
};

export type DDSReactionTimeProps = {
  assignment: import("@/entities/training").Assignment;
};
