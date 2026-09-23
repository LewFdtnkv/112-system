import {
  type Assignment,
  type StudentLesson,
  type Attempt,
} from "@/entities/training";
export type DDSWorkspaceProps = {
  initial: Attempt;
  lesson?: StudentLesson;
  onSelectAssignment?: (assignment: Assignment) => void;
  onClose: () => void;
  onSaved: () => void;
};
