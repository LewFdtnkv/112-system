import { type StudentLesson, type Attempt } from "@/entities/training";
export type DDSWorkspaceProps = {
  initial: Attempt;
  lesson?: StudentLesson;
  onClose: () => void;
  onSaved: () => void;
};
