import { type Attempt } from "@/entities/training";
export type DDSWorkspaceProps = {
  initial: Attempt;
  onClose: () => void;
  onSaved: () => void;
};
